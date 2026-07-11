import time
from gradio_client import Client, file

IMAGE_PATH = r"C:\Users\asus\Documents\Side-Projects\maker\.scratch\wayfinder\image-to-3d-mvp-spec\prototype\test-chair.png"

client = Client("stabilityai/TripoSR")

t0 = time.time()
processed = client.predict(
    file(IMAGE_PATH),
    True,   # Remove Background
    0.85,   # Foreground Ratio
    api_name="/preprocess",
)
t1 = time.time()
print(f"[preprocess] {t1 - t0:.2f}s -> {processed}")

t2 = time.time()
result = client.predict(
    file(processed),
    256,    # Marching Cubes Resolution
    api_name="/generate",
)
t3 = time.time()
print(f"[generate] {t3 - t2:.2f}s -> {result}")

print(f"[total] {t3 - t0:.2f}s")
print("OBJ:", result[0])
print("GLB:", result[1])
