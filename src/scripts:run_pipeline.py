"""Run the Narrative Drift pipeline."""

from __future__ import annotations

import argparse

from src.pipeline import run_pipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Narrative Drift pipeline.")
    parser.add_argument("--input", required=True, help="Path to input CSV")
    parser.add_argument("--artifacts", default="artifacts", help="Artifacts output directory")
    parser.add_argument(
        "--model",
        default="all-MiniLM-L6-v2",
        help="Sentence transformer model name",
    )
    parser.add_argument("--clusters", type=int, default=8, help="Number of clusters")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    run_pipeline(
        input_csv=args.input,
        artifacts_dir=args.artifacts,
        model_name=args.model,
        n_clusters=args.clusters,
    )


if __name__ == "__main__":
    main()