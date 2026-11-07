FROM python:3.11.18-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MACROCART_DATA_DIR=/app/data \
    HOME=/tmp
# HOME=/tmp: gunicorn writes its control socket under ~/.gunicorn, and the
# root filesystem is read-only in compose.yaml (only /tmp is a tmpfs).

WORKDIR /app

COPY requirements.txt .
# pip/setuptools/wheel are removed from the final image: not needed at runtime.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y pip setuptools wheel

COPY app.py .
COPY static/ ./static/

RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /app/data && chown app:app /app/data
USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=6s --retries=3 --start-period=15s \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/api/items',timeout=5).status==200 else 1)"

# One worker (SQLite, light load); threads for concurrent requests.
CMD ["gunicorn", "-b", "0.0.0.0:5000", "-w", "1", "--threads", "4", "app:app"]
