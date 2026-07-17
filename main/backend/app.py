"""Crema — Espresso Recipe Optimization App.

Flask application serving the REST API and, in production, the built frontend.
"""

import os
import sys

from flask import Flask, send_from_directory

sys.path.insert(0, os.path.dirname(__file__))

from api.bayesian_routes import bayesian_bp
from api.golden_routes import golden_bp
from api.pipeline_routes import pipeline_bp
from api.recipe_routes import recipe_bp
from api.secant_routes import secant_bp
from api.shots_routes import shots_bp


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)

    app.register_blueprint(pipeline_bp)
    app.register_blueprint(secant_bp)
    app.register_blueprint(golden_bp)
    app.register_blueprint(recipe_bp)
    app.register_blueprint(bayesian_bp)
    app.register_blueprint(shots_bp)

    dist_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
    if os.path.isdir(dist_dir):
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_frontend(path: str):
            if path and os.path.isfile(os.path.join(dist_dir, path)):
                return send_from_directory(dist_dir, path)
            return send_from_directory(dist_dir, "index.html")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5050, debug=True)