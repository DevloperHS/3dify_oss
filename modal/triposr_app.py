# TripoSR packaged as a Modal serverless GPU function (ticket 03).
#
# Deploy:   modal deploy modal/triposr_app.py
# Smoke:    modal run modal/triposr_app.py --image-path path/to/photo.png
#
# The deployed web endpoint takes a POST body of raw image bytes and returns
# GLB bytes (vertex-colored, not watertight — postprocessing is ticket 04).
# It is protected by Modal proxy auth: callers must send Modal-Key and
# Modal-Secret headers from a proxy auth token (Modal dashboard → Settings →
# Proxy Auth Tokens). The worker-side caller is ModalReconstructionEngine
# (src/reconstruction/modal-engine.ts).
#
# Scale-to-zero is Modal's default; SCALEDOWN_WINDOW below only controls how
# long an idle container lingers before that happens.

import io

import modal
from fastapi import Request, Response

TRIPOSR_REPO = "https://github.com/VAST-AI-Research/TripoSR"
TRIPOSR_COMMIT = "107cefdc244c39106fa830359024f6a2f1c78871"  # main @ 2026-07
MODEL_REPO = "stabilityai/TripoSR"
HF_HOME = "/models"

# T4 (16GB) comfortably covers TripoSR's ~6GB VRAM need at the lowest price.
GPU = "T4"
SCALEDOWN_WINDOW_SECONDS = 60
# Matches the caller's default RECONSTRUCTION_TIMEOUT_MS so an abandoned
# request doesn't keep the GPU billing after the job has already failed.
FUNCTION_TIMEOUT_SECONDS = 240

# Marching-cubes grid resolution — raised from the prototype's 256 for finer
# geometric detail after live runs judged 256 too coarse for game assets.
# 512 crashes torchmcubes (native abort, dense-grid allocation); 320 is the
# highest that ran reliably on this stack.
MC_RESOLUTION = 320
FOREGROUND_RATIO = 0.85


def download_weights() -> None:
    # Bake model weights and the rembg U2-Net into the image at build time so
    # cold starts don't re-download them.
    from huggingface_hub import snapshot_download
    from rembg import new_session

    snapshot_download(MODEL_REPO)
    new_session()


image = (
    # torchmcubes compiles a CUDA extension at build time, so the base image
    # needs the full toolkit (devel flavor, nvcc included).
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.11"
    )
    .entrypoint([])
    .apt_install("git", "libgl1", "libglib2.0-0", "build-essential")
    .pip_install("torch==2.4.1", "numpy==1.26.4")
    # No GPU is attached at image-build time, so tell nvcc which architectures
    # to compile for: T4 (7.5) plus common fallbacks (A100/A10G/L4). Modal's
    # builder exports CXX=clang++, which neither exists in this image nor
    # suits nvcc — pin the toolchain back to gcc for the CUDA extension build.
    .env({"TORCH_CUDA_ARCH_LIST": "7.5;8.0;8.6;8.9", "CC": "gcc", "CXX": "g++"})
    .pip_install("git+https://github.com/tatsy/torchmcubes.git")
    .pip_install(
        # TripoSR's requirements.txt, minus gradio/xatlas/moderngl/imageio
        # (only needed for its demo UI and texture baking, which we don't use).
        "omegaconf==2.3.0",
        "Pillow==10.1.0",
        "einops==0.7.0",
        "transformers==4.35.0",
        "trimesh==4.0.5",
        "rembg[cpu]",
        # rembg's dependency tree pulls numpy 2.x over the earlier 1.26.4 pin;
        # trimesh 4.0.5 still calls ndarray.ptp(), removed in numpy 2 — so the
        # export step 500s at runtime. Repeat the pin in this layer to hold it.
        "numpy==1.26.4",
        "huggingface-hub",
        "fastapi[standard]",
    )
    .run_commands(
        f"git clone {TRIPOSR_REPO} /root/TripoSR"
        f" && cd /root/TripoSR && git checkout {TRIPOSR_COMMIT}"
    )
    # TripoSR ships no setup.py — import its tsr package straight from the clone.
    .env({"PYTHONPATH": "/root/TripoSR", "HF_HOME": HF_HOME})
    .run_function(download_weights)
)

app = modal.App("maker-triposr")


@app.cls(
    image=image,
    gpu=GPU,
    scaledown_window=SCALEDOWN_WINDOW_SECONDS,
    timeout=FUNCTION_TIMEOUT_SECONDS,
)
class TripoSR:
    @modal.enter()
    def load(self) -> None:
        import torch
        from rembg import new_session
        from tsr.system import TSR

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = TSR.from_pretrained(
            MODEL_REPO, config_name="config.yaml", weight_name="model.ckpt"
        )
        self.model.renderer.set_chunk_size(8192)
        self.model.to(self.device)
        self.rembg_session = new_session()

    def _reconstruct(self, image_bytes: bytes) -> bytes:
        import numpy as np
        import torch
        import trimesh
        from PIL import Image as PILImage
        from tsr.utils import remove_background, resize_foreground

        # Preprocessing mirrors TripoSR's own run.py: strip background, frame
        # the foreground, composite onto neutral gray.
        pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        pil = remove_background(pil, self.rembg_session)
        pil = resize_foreground(pil, FOREGROUND_RATIO)
        arr = np.array(pil).astype(np.float32) / 255.0
        arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
        pil = PILImage.fromarray((arr * 255.0).astype(np.uint8))

        with torch.no_grad():
            scene_codes = self.model([pil], device=self.device)
        # Second arg True = compute vertex colors (we never bake textures).
        meshes = self.model.extract_mesh(scene_codes, True, resolution=MC_RESOLUTION)
        mesh = meshes[0]
        # TripoSR meshes aren't glTF Y-up; without this the model lies on its
        # side in viewers. Same fix TripoSR's demo applies before display.
        mesh.apply_transform(
            trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
        )
        mesh.apply_transform(
            trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0])
        )
        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb = glb.encode()
        return glb

    @modal.method()
    def generate(self, image_bytes: bytes) -> bytes:
        # Plain Modal method for `modal run` smoke tests, same core path as
        # the web endpoint.
        return self._reconstruct(image_bytes)

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    async def reconstruct(self, request: Request) -> Response:
        body = await request.body()
        if not body:
            return Response(content="empty request body", status_code=400)
        glb = self._reconstruct(body)
        return Response(content=glb, media_type="model/gltf-binary")


@app.local_entrypoint()
def main(image_path: str, output_path: str = "output.glb") -> None:
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    glb = TripoSR().generate.remote(image_bytes)
    with open(output_path, "wb") as f:
        f.write(glb)
    print(f"wrote {len(glb)} bytes to {output_path}")
