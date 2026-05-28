"""
start.py — Khởi động PropMap:
  - Backend: FastAPI tại http://localhost:8000
  - Frontend: Vite dev server tại http://localhost:5173

Usage:
  python start.py
"""
import subprocess
import sys
import os
import time
import threading

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


def stream_output(proc, prefix: str):
    """Stream stdout từ subprocess, thêm prefix."""
    for line in iter(proc.stdout.readline, b''):
        print(f"[{prefix}] {line.decode('utf-8', errors='replace').rstrip()}")


def main():
    print("=" * 55)
    print("  PropMap — Starting...")
    print("=" * 55)

    # Backend
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    threading.Thread(target=stream_output, args=(backend, "API"), daemon=True).start()

    # Wait for backend to be ready
    time.sleep(2)

    # Frontend
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    threading.Thread(target=stream_output, args=(frontend, "UI"), daemon=True).start()

    print("\n  [OK] Backend: http://localhost:8000")
    print("  [OK] Frontend: http://localhost:5173")
    print("  [DOCS] API docs: http://localhost:8000/docs")
    print("\n  Press Ctrl+C to stop.\n")

    try:
        backend.wait()
    except KeyboardInterrupt:
        print("\n\nStopping PropMap...")
        backend.terminate()
        frontend.terminate()


if __name__ == "__main__":
    main()
