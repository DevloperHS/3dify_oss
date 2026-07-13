# TRELLIS (microsoft/TRELLIS-image-large) packaged as a Modal serverless GPU
# function — the quality upgrade over TripoSR: real UV-textured GLB output
# (xatlas unwrap + baked 1024² texture) instead of vertex colors.
#
# Deploy:   modal deploy modal/trellis_app.py
# Smoke:    modal run modal/trellis_app.py --image-path path/to/photo.png
#
# Same contract as triposr_app.py: POST raw image bytes behind Modal proxy
# auth, GLB bytes back. The worker-side caller is ModalReconstructionEngine
# (src/reconstruction/modal-engine.ts) with RECONSTRUCTION_ENGINE=trellis.
#
# Design notes (researched 2026-07-13):
# - Code + weights are MIT, weights ungated on HuggingFace.
# - L4 (24GB, SM89): TRELLIS needs 16GB minimum; the one known public
#   TRELLIS-on-Modal deployment runs L4. ~$0.80/hr from free monthly credits.
# - xformers attention instead of flash-attn: prebuilt wheel, no CUDA
#   compile, supported backend via ATTN_BACKEND (TRELLIS README documents it).
# - SPCONV_ALGO=native: "auto" benchmarks kernels at startup — wasted time in
#   a scale-to-zero container.
# - Only the diff-gaussian-rasterization extension needs compiling; with
#   TORCH_CUDA_ARCH_LIST pinned it compiles on a CPU-only builder (same
#   pattern as torchmcubes in triposr_app.py). diffoctreerast is NOT
#   installed: it's only needed for radiance-field output, which we don't
#   request — and it carries the Inria non-commercial license taint.

import io

import modal
from fastapi import Request, Response

TRELLIS_REPO = "https://github.com/microsoft/TRELLIS"
TRELLIS_COMMIT = "442aa1e1afb9014e80681d3bf604e8d728a86ee7"  # main @ 2026-07
UTILS3D_COMMIT = "9a4eb15e4021b67b12c460c7057d642626897ec8"  # pin from TRELLIS setup.sh
MIP_SPLATTING_REPO = "https://github.com/autonomousvision/mip-splatting"
MIP_SPLATTING_COMMIT = "dda02ab5ecf45d6edb8c540d9bb65c7e451345a9"
MODEL_REPO = "microsoft/TRELLIS-image-large"
HF_HOME = "/models"

GPU = "L4"
SCALEDOWN_WINDOW_SECONDS = 60
# Matches the caller's default RECONSTRUCTION_TIMEOUT_MS (4 min). TRELLIS on
# L4 runs ~1-2 min/job including the texture bake.
FUNCTION_TIMEOUT_SECONDS = 240

# to_glb knobs: keep 95% simplification (default) and a 1024² baked texture.
SIMPLIFY_RATIO = 0.95
TEXTURE_SIZE = 1024


def download_weights() -> None:
    # Bake model weights and the rembg U2-Net into the image at build time so
    # cold starts don't re-download them.
    from huggingface_hub import snapshot_download
    from rembg import new_session

    snapshot_download(MODEL_REPO)
    new_session()


image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.11"
    )
    .entrypoint([])
    .apt_install(
        "git", "libgl1", "libglib2.0-0", "build-essential", "ninja-build", "cmake"
    )
    # torch 2.4.0 = TRELLIS's verified version; default wheels are cu121,
    # which run fine on the 12.4 driver stack.
    .pip_install("torch==2.4.0", "torchvision==0.19.0", "numpy==1.26.4")
    # No GPU at image-build time: pin the arches so the CUDA extension build
    # (diff-gaussian-rasterization) doesn't try to query a device. L4 is 8.9;
    # 8.0/8.6 kept as fallbacks. Modal's builder exports CXX=clang++ — pin
    # the toolchain back to gcc (same fix as triposr_app.py).
    .env(
        {
            "TORCH_CUDA_ARCH_LIST": "8.0;8.6;8.9",
            "CC": "gcc",
            "CXX": "g++",
            "ATTN_BACKEND": "xformers",
            "SPCONV_ALGO": "native",
        }
    )
    .pip_install(
        # TRELLIS setup.sh --basic set, minus video/demo-only extras.
        "pillow",
        "imageio",
        "imageio-ffmpeg",
        "tqdm",
        "easydict",
        "opencv-python-headless",
        "scipy",
        "ninja",
        "onnxruntime",
        "rembg",
        "trimesh",
        "open3d",
        "xatlas",
        "pyvista",
        "pymeshfix",
        "igraph",
        "transformers==4.46.3",
        "safetensors",
        "huggingface-hub",
        "fastapi[standard]",
        # Same trap as triposr_app.py: rembg/opencv trees pull numpy 2.x over
        # the earlier pin, breaking trimesh export — repeat the pin here.
        "numpy==1.26.4",
        # Attention + sparse conv, both prebuilt wheels (no compile):
        "xformers==0.0.27.post2",  # matches torch 2.4.0
        "spconv-cu120",
        f"git+https://github.com/EasternJournalist/utils3d.git@{UTILS3D_COMMIT}",
    )
    # kaolin ships GPU wheels on NVIDIA's index, keyed to torch+cuda version.
    .run_commands(
        "pip install kaolin -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.4.0_cu121.html"
    )
    # nvdiffrast has no PyPI wheel; installs from git without needing a GPU
    # (its CUDA kernels JIT-compile at first use, nvcc is in the devel image).
    .run_commands("pip install git+https://github.com/NVlabs/nvdiffrast.git")
    # The one real CUDA compile: mip-splatting's diff-gaussian-rasterization,
    # used to render the Gaussian representation for texture baking.
    .run_commands(
        f"git clone {MIP_SPLATTING_REPO} /tmp/mip-splatting"
        f" && cd /tmp/mip-splatting && git checkout {MIP_SPLATTING_COMMIT}"
        " && pip install /tmp/mip-splatting/submodules/diff-gaussian-rasterization/"
        " && rm -rf /tmp/mip-splatting"
    )
    .run_commands(
        f"git clone {TRELLIS_REPO} /root/TRELLIS"
        f" && cd /root/TRELLIS && git checkout {TRELLIS_COMMIT}"
    )
    # TRELLIS ships no setup.py — import its trellis package from the clone.
    .env({"PYTHONPATH": "/root/TRELLIS", "HF_HOME": HF_HOME})
    .run_function(download_weights)
)

app = modal.App("maker-trellis")


@app.cls(
    image=image,
    gpu=GPU,
    scaledown_window=SCALEDOWN_WINDOW_SECONDS,
    timeout=FUNCTION_TIMEOUT_SECONDS,
)
class Trellis:
    @modal.enter()
    def load(self) -> None:
        from trellis.pipelines import TrellisImageTo3DPipeline

        self.pipeline = TrellisImageTo3DPipeline.from_pretrained(MODEL_REPO)
        self.pipeline.cuda()

    def _reconstruct(self, image_bytes: bytes) -> bytes:
        from PIL import Image as PILImage
        from trellis.utils import postprocessing_utils

        pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        # Fixed seed for reproducibility across retries. Only gaussian + mesh
        # formats: radiance_field would require diffoctreerast (unused +
        # non-commercial-licensed).
        outputs = self.pipeline.run(pil, seed=42, formats=["gaussian", "mesh"])
        glb_mesh = postprocessing_utils.to_glb(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=SIMPLIFY_RATIO,
            texture_size=TEXTURE_SIZE,
        )
        glb = glb_mesh.export(file_type="glb")
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
    glb = Trellis().generate.remote(image_bytes)
    with open(output_path, "wb") as f:
        f.write(glb)
    print(f"wrote {len(glb)} bytes to {output_path}")
