# Domain Glossary

## Asset
The generated 3D output (a GLB file) belonging to a user, stored permanently in their library
(Cloudflare R2). One Asset is produced per completed Job.

## Job
One async unit of work: a single Source Image submitted for reconstruction, tracked from Upload
through Moderation, Preprocessing, Reconstruction, Postprocessing, and Export/Storage — ending in
either a finished Asset or a failure. Owned by a user; the unit usage metering will eventually
count against, once billing exists (out of scope for now).

## Pipeline
The ordered sequence of stages a Job passes through:

```
Upload → Moderation → Preprocessing → Reconstruction → Postprocessing → Export/Storage
```

Each stage is a candidate deep module (see the `codebase-design` skill) with one seam.

## Reconstruction
The ML step that converts a single 2D Source Image into a 3D mesh. Self-hosted TripoSR is the
primary approach, running as a Modal serverless GPU function; InstantMesh is the fallback if
TripoSR's fidelity disappoints in real usage. This is the pipeline's one formal seam — see
ReconstructionEngine.

## ReconstructionEngine
The pluggable-adapter interface the Reconstruction pipeline stage is built behind: takes a
preprocessed Source Image, returns a raw mesh. TripoSR and InstantMesh are its two
implementations. The only pipeline stage built as a formal seam (per `codebase-design`) — every
other stage (Moderation, Preprocessing, Postprocessing, Export/Storage) currently has exactly one
implementation and is a plain module boundary instead.

## Source Image
The single user-uploaded 2D image driving a Job. Stored in Cloudinary, referenced by URL from
Postgres. Retained only as long as needed for a possible re-run, not indefinitely.

## Moderation
A required Pipeline stage between Upload and Preprocessing that screens a Source Image before any
reconstruction compute is spent on it. Provider/approach not yet decided.

## Postprocessing
The Pipeline stage between Reconstruction and Export/Storage. Confirmed necessary (not just
optional optimization) by prototyping: TripoSR's raw output is not watertight (holes from
occluded/guessed surfaces) and is vertex-colored rather than UV-textured. This stage must at least
repair/fill the mesh before export; UV-unwrapping only becomes necessary if a future export target
requires a texture map instead of vertex colors.
