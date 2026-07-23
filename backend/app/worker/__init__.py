"""Local generation worker.

Consumes the generation_task queue on the machine where Ollama lives. The API
and frontend on the host only enqueue and poll; the heavy work (translation,
solving, validation, persistence) happens here.
"""
