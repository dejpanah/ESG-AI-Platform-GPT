"""Enterprise Local KnowledgeOS RAG Engine.

Storage-agnostic RAG service. Vector and metadata backends are selected via
configuration (qdrant | postgres). PostgreSQL is required for
operational data and report archives when available.
"""

__version__ = "2.0.0-enterprise"