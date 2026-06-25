"""Graph construction for narrative and user interactions."""

from __future__ import annotations

from typing import Tuple

import networkx as nx
import pandas as pd


CLUSTER_PREFIX = "cluster_"


def build_narrative_graph(posts: pd.DataFrame) -> nx.Graph:
    graph = nx.Graph()

    for _, row in posts.iterrows():
        user_node = f"user:{row['user']}"
        cluster_node = f"{CLUSTER_PREFIX}{row['cluster']}"

        if not graph.has_node(user_node):
            graph.add_node(user_node, node_type="user")
        if not graph.has_node(cluster_node):
            graph.add_node(cluster_node, node_type="cluster")

        if graph.has_edge(user_node, cluster_node):
            graph[user_node][cluster_node]["weight"] += 1
        else:
            graph.add_edge(user_node, cluster_node, weight=1)

    return graph


def compute_centrality(graph: nx.Graph) -> Tuple[pd.DataFrame, pd.DataFrame]:
    degree = nx.degree_centrality(graph)
    betweenness = nx.betweenness_centrality(graph)

    centrality_df = (
        pd.DataFrame({"node": list(degree.keys()), "degree": list(degree.values())})
        .merge(
            pd.DataFrame(
                {"node": list(betweenness.keys()), "betweenness": list(betweenness.values())}
            ),
            on="node",
        )
        .sort_values("degree", ascending=False)
    )

    influencers = centrality_df[centrality_df["node"].str.startswith("user:")].copy()
    influencers["user"] = influencers["node"].str.replace("user:", "", regex=False)
    return centrality_df, influencers