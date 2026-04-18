from flask import Flask, request, jsonify, render_template, make_response, Response
import requests
from werkzeug.utils import secure_filename
import os
from datetime import datetime, timedelta
import requests
from flask_cors import CORS

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app, resources={r"/*": {"origins": "*"}})

TARGET = "https://unopprobrious-jason-demonstrational.ngrok-free.dev"
HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
};

# Serve moved static assets if needed (css/js moved outside expected folders)
from flask import send_from_directory, abort

def _serve_candidate_file(subdir, filename):
    base = BASE_DIR
    parent = os.path.dirname(BASE_DIR)
    candidates = [
        os.path.join(base, subdir),
        base,
        os.path.join(parent, subdir),
        os.path.join(base, 'static', subdir),
        os.path.join(parent, 'static', subdir)
    ]
    for d in candidates:
        path = os.path.join(d, filename)
        if os.path.isfile(path):
            return send_from_directory(d, filename)
    abort(404)


@app.route('/css/<path:filename>')
def serve_css(filename):
    return _serve_candidate_file('css', filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    return _serve_candidate_file('js', filename)

# CORS: ensure cross-origin headers are sent (helps when proxies like ngrok strip them)
@app.before_request
def _handle_options():
    # Respond to preflight OPTIONS requests early
    if request.method == 'OPTIONS':
        resp = make_response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        return resp


@app.after_request
def _add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response



# Consolidated proxy implementation exists later in this file.


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"success": False, "message": "Missing credentials"}), 400

    # Demo: accept any credentials and return a guard object
  
    return jsonify({"success": True, "guard": guard})


@app.route("/api/schedule/<guard_name>")
def api_schedule(guard_name):
    today = datetime.utcnow().date()
    schedules = []
    for i in range(5):
        d = today + timedelta(days=i)
        schedules.append(
            {
                "shift_date": d.isoformat(),
                "location": f"Site {(i % 3) + 1}",
                "time": "07:00 - 15:00" if i % 2 == 0 else "15:00 - 23:00",
            }
        )
    return jsonify({"success": True, "schedules": schedules})


@app.route("/api/cancel-requests/<guard_name>")
def api_cancel_requests(guard_name):
    today = datetime.utcnow().date()
    reqs = [
        {
            "date": (today - timedelta(days=2)).isoformat(),
            "location": "Site 1",
            "submitted_at": (today - timedelta(days=3)).isoformat(),
            "status": "approved",
        },
        {
            "date": (today + timedelta(days=4)).isoformat(),
            "location": "Site 2",
            "submitted_at": (today - timedelta(days=1)).isoformat(),
            "status": "pending",
        },
    ]
    return jsonify({"success": True, "requests": reqs})


@app.route("/api/request-cancel", methods=["POST"])
def api_request_cancel():
    data = request.get_json() or {}
    # In production: validate & persist; here we return success for demo
    return jsonify({"success": True, "message": "Request submitted"})


@app.route("/api/incident", methods=["POST"])
def api_incident():
    # Accept form data and optional file upload (FormData)
    guard_id = request.form.get("guard_id")
    title = request.form.get("title")
    incident_date = request.form.get("incident_date")
    incident_time = request.form.get("incident_time")
    description = request.form.get("description")

    file = request.files.get("attachment")
    saved = None
    if file:
        filename = secure_filename(file.filename)
        path = os.path.join(UPLOAD_DIR, filename)
        file.save(path)
        saved = filename

    # Demo: respond success
    return jsonify({"success": True, "message": "Incident received", "file_saved": saved})


@app.route("/api/leave-balance/<int:guard_id>")
def api_leave_balance(guard_id):
    # Demo static values
    return jsonify({"success": True, "available": 12, "used": 3, "pending": 2})


@app.route("/api/leave", methods=["POST"])
def api_leave():
    data = request.get_json() or {}
    # In production: validate & persist
    return jsonify({"success": True, "message": "Leave request received"})


@app.route('/proxy/<path:subpath>', methods=['GET','POST','OPTIONS'])
def proxy(subpath):
    if request.method == 'OPTIONS':
        resp = make_response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        return resp

    url = f"{TARGET}/{subpath}"
    # forward simple GET/POST; adapt for files if needed
    if request.method == 'GET':
        r = requests.get(url, params=request.args, headers={k:v for k,v in request.headers.items() if k.lower()!='host'})
    else:
        r = requests.post(url, json=request.get_json(silent=True), data=request.get_data(), headers={k:v for k,v in request.headers.items() if k.lower()!='host'})

    excluded = ['content-encoding','transfer-encoding','connection','content-length']
    resp = make_response(r.content, r.status_code)
    for k,v in r.headers.items():
        if k.lower() not in excluded:
            resp.headers[k] = v
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


if __name__ == "__main__":
    app.run(debug=True)