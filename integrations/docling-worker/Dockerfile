FROM python:3.12-slim

WORKDIR /worker
COPY worker.py /worker/worker.py

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

CMD ["python", "/worker/worker.py"]
