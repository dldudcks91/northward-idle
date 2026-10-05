"""Serve the game locally, using only Python's standard library."""

from __future__ import annotations

import argparse
import mimetypes
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class GameHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="브라우저에서 게임 주소 열기")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    mimetypes.add_type("text/javascript", ".js")
    handler = partial(GameHandler, directory=str(root))
    url = f"http://127.0.0.1:{args.port}"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError:
        print(f"이 주소의 서버가 이미 실행 중입니다: {url}")
        if args.open:
            webbrowser.open(url)
        return
    if args.open:
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()
    print(f"북방 생존 방치 게임: {url}", flush=True)
    print("이 창을 열어두세요. 종료: Ctrl+C", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
