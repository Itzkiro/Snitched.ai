#!/bin/bash
#
# Start the Social Media Monitoring Daemon
#
# This script starts the daemon in the background with logging.
# Logs are written to scrapers/logs/daemon.log
#
# Usage:
#   ./scripts/start-social-daemon.sh          # Start daemon
#   ./scripts/start-social-daemon.sh stop     # Stop daemon
#   ./scripts/start-social-daemon.sh status   # Check status
#   ./scripts/start-social-daemon.sh restart  # Restart daemon

set -e
cd "$(dirname "$0")/.."

LOG_DIR="scrapers/logs"
LOG_FILE="$LOG_DIR/daemon.log"
PID_FILE=".tmp/social-daemon.pid"

mkdir -p "$LOG_DIR" ".tmp"

case "${1:-start}" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Daemon already running (PID $(cat "$PID_FILE"))"
      exit 1
    fi

    echo "Starting social media monitoring daemon..."
    nohup npx tsx scripts/social-media-daemon.ts \
      --interval "${DAEMON_INTERVAL:-15}" \
      --batch-size "${DAEMON_BATCH_SIZE:-10}" \
      --platforms "${DAEMON_PLATFORMS:-twitter,rss,news,press}" \
      >> "$LOG_FILE" 2>&1 &

    echo $! > "$PID_FILE"
    echo "Daemon started (PID $!)"
    echo "Logs: tail -f $LOG_FILE"
    ;;

  stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping daemon (PID $PID)..."
        kill "$PID"
        # Wait for graceful shutdown
        for i in $(seq 1 10); do
          if ! kill -0 "$PID" 2>/dev/null; then
            echo "Daemon stopped."
            rm -f "$PID_FILE"
            exit 0
          fi
          sleep 1
        done
        echo "Force killing..."
        kill -9 "$PID" 2>/dev/null
        rm -f "$PID_FILE"
      else
        echo "Daemon not running (stale PID file)"
        rm -f "$PID_FILE"
      fi
    else
      echo "No PID file found. Daemon not running."
    fi
    ;;

  restart)
    "$0" stop
    sleep 2
    "$0" start
    ;;

  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      PID=$(cat "$PID_FILE")
      echo "Daemon is running (PID $PID)"
      echo ""
      # Show last few lines of state
      if [ -f ".tmp/social-daemon-state.json" ]; then
        echo "State:"
        cat ".tmp/social-daemon-state.json"
        echo ""
      fi
      echo "Recent logs:"
      tail -20 "$LOG_FILE" 2>/dev/null || echo "(no logs yet)"
    else
      echo "Daemon is NOT running."
      if [ -f ".tmp/social-daemon-state.json" ]; then
        echo ""
        echo "Last state:"
        cat ".tmp/social-daemon-state.json"
      fi
    fi
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
