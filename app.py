import json
import os
import sys
from http.server import HTTPServer, ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from dotenv import load_dotenv

# Import project modules
from github_client import (
    parse_repo_url,
    get_repo_metadata,
    get_languages,
    get_file_tree,
    get_file_content,
)
from analyzer import (
    detect_tech_stack,
    select_key_files,
    group_by_folder,
)
from prompt_builder import build_prompt
from llm import generate_report

load_dotenv()

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

SAMPLE_REPOSITORIES = [
    {
        "name": "psf/requests",
        "url": "https://github.com/psf/requests",
        "description": "A simple, yet elegant, HTTP library for Python.",
        "language": "Python"
    },
    {
        "name": "pallets/flask",
        "url": "https://github.com/pallets/flask",
        "description": "The Python micro framework for building web applications.",
        "language": "Python"
    },
    {
        "name": "fastapi/fastapi",
        "url": "https://github.com/fastapi/fastapi",
        "description": "Modern, fast (high-performance) web framework for building APIs.",
        "language": "Python"
    },
    {
        "name": "astral-sh/uv",
        "url": "https://github.com/astral-sh/uv",
        "description": "An extremely fast Python package and project manager, written in Rust.",
        "language": "Rust"
    }
]


class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def _send_json_response(self, status_code, data):
        response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(response_bytes)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        body = self.rfile.read(content_length).decode("utf-8")
        return json.loads(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path).path

        if parsed_path == "/api/health":
            has_gemini_key = bool(os.getenv("GEMINI_API_KEY"))
            self._send_json_response(200, {
                "status": "healthy",
                "has_gemini_key": has_gemini_key,
                "version": "1.0.0"
            })
            return

        if parsed_path == "/api/samples":
            self._send_json_response(200, {
                "samples": SAMPLE_REPOSITORIES
            })
            return

        # Serve static assets or fallback to index.html
        if parsed_path == "/" or not os.path.exists(os.path.join(STATIC_DIR, parsed_path.lstrip("/"))):
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path).path

        if parsed_path == "/api/analyze":
            try:
                data = self._read_json_body()
                repo_url = data.get("url", "").strip()

                if not repo_url:
                    self._send_json_response(400, {"error": "Repository URL is required."})
                    return

                owner, repo = parse_repo_url(repo_url)
                metadata = get_repo_metadata(owner, repo)
                languages = get_languages(owner, repo)
                tree = get_file_tree(owner, repo, metadata["default_branch"])
                tech_stack = detect_tech_stack(languages, tree)
                key_files = select_key_files(tree)
                folder_groups = group_by_folder(tree)

                self._send_json_response(200, {
                    "owner": owner,
                    "repo": repo,
                    "metadata": metadata,
                    "languages": languages,
                    "tech_stack": tech_stack,
                    "key_files": key_files,
                    "folder_groups": folder_groups,
                    "file_count": len(tree),
                })
            except (ValueError, RuntimeError) as err:
                self._send_json_response(400, {"error": str(err)})
            except Exception as err:
                self._send_json_response(500, {"error": f"An unexpected error occurred: {str(err)}"})
            return

        if parsed_path == "/api/explain":
            try:
                data = self._read_json_body()
                repo_url = data.get("url", "").strip()

                if not repo_url:
                    self._send_json_response(400, {"error": "Repository URL is required."})
                    return

                owner, repo = parse_repo_url(repo_url)
                metadata = get_repo_metadata(owner, repo)
                languages = get_languages(owner, repo)
                tree = get_file_tree(owner, repo, metadata["default_branch"])
                tech_stack = detect_tech_stack(languages, tree)
                key_files = select_key_files(tree)
                folder_groups = group_by_folder(tree)

                key_file_contents = {}
                for file_item in key_files:
                    path = file_item["path"]
                    try:
                        content = get_file_content(
                            owner,
                            repo,
                            path,
                            metadata["default_branch"]
                        )
                        key_file_contents[path] = content
                    except Exception:
                        key_file_contents[path] = f"# Could not fetch content for {path}"

                prompt = build_prompt(
                    metadata,
                    tech_stack,
                    folder_groups,
                    tree,
                    key_file_contents,
                )

                report = generate_report(prompt)

                self._send_json_response(200, {
                    "owner": owner,
                    "repo": repo,
                    "metadata": metadata,
                    "languages": languages,
                    "tech_stack": tech_stack,
                    "key_files": key_files,
                    "folder_groups": folder_groups,
                    "file_count": len(tree),
                    "report": report,
                    "prompt": prompt
                })
            except (ValueError, RuntimeError) as err:
                self._send_json_response(400, {"error": str(err)})
            except Exception as err:
                self._send_json_response(500, {"error": f"An unexpected error occurred: {str(err)}"})
            return

        self._send_json_response(404, {"error": "Endpoint not found"})


def run_server(port=5000):
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    os.makedirs(STATIC_DIR, exist_ok=True)
    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, AppRequestHandler)
    print(f"[*] GitHub Repo Explainer Web UI running at http://localhost:{port}")
    print(f"[*] Serving static files from: {STATIC_DIR}")
    print("[*] Press Ctrl+C to stop the server.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopped.")
        httpd.server_close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
