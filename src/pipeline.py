"""End-to-end pipeline for Narrative Drift."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from .clustering import cluster_embeddings
from .data_loader import load_posts
from .embeddings import embed_texts
from .graph_builder import build_narrative_graph, compute_centrality


@dataclass
class PipelineConfig:
    input_csv: Path
    artifacts_dir: Path
    model_name: str
    n_clusters: int


@dataclass
class PipelineOutputs:
    posts: pd.DataFrame
    embeddings: np.ndarray
    graph_path: Path
    clusters_path: Path
    embeddings_path: Path
    centrality_path: Path


DEFAULT_MODEL = "all-MiniLM-L6-v2"


def run_pipeline(
    input_csv: str,
    artifacts_dir: str = "artifacts",
    model_name: str = DEFAULT_MODEL,
    n_clusters: int = 8,
) -> PipelineOutputs:
    config = PipelineConfig(
        input_csv=Path(input_csv),
        artifacts_dir=Path(artifacts_dir),
        model_name=model_name,
        n_clusters=n_clusters,
    )
    config.artifacts_dir.mkdir(parents=True, exist_ok=True)

    posts = load_posts(str(config.input_csv))
    embeddings = embed_texts(posts["text_clean"], model_name=config.model_name)
    labels, _ = cluster_embeddings(embeddings, n_clusters=config.n_clusters)
    posts = posts.copy()
    posts["cluster"] = labels

    embeddings_path = config.artifacts_dir / "embeddings.npy"
    np.save(embeddings_path, embeddings)

    clusters_path = config.artifacts_dir / "clusters.csv"
    posts.to_csv(clusters_path, index=False)

    graph = build_narrative_graph(posts)
    graph_path = config.artifacts_dir / "narrative_graph.graphml"
    import networkx as nx

    nx.write_graphml(graph, graph_path)

    centrality, influencers = compute_centrality(graph)
    centrality_path = config.artifacts_dir / "centrality.csv"
    centrality.to_csv(centrality_path, index=False)

    influencers_path = config.artifacts_dir / "influencers.csv"
    influencers.to_csv(influencers_path, index=False)

    return PipelineOutputs(
        posts=posts,
        embeddings=embeddings,
        graph_path=graph_path,
        clusters_path=clusters_path,
        embeddings_path=embeddings_path,
        centrality_path=centrality_path,
    )