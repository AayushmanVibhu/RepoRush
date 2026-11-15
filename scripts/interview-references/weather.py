from typing import Any, Iterable, Generator


def process_events(events: Iterable[dict[str, Any]]) -> Generator[dict[str, Any], None, None]:
    stations = {}
    as_of = None
    for event in events:
        if event["type"] == "sample":
            name = event["stationName"]
            temperature = event["temperature"]
            previous = stations.get(name, {"high": temperature, "low": temperature})
            stations[name] = {"high": max(previous["high"], temperature),
                              "low": min(previous["low"], temperature)}
            as_of = event["timestamp"]
        elif event["type"] == "control":
            command = event["command"]
            if command not in ("snapshot", "reset"):
                raise ValueError("Unknown control command")
            if not stations:
                continue
            if command == "snapshot":
                yield {"type": "snapshot", "asOf": as_of,
                       "stations": {name: dict(values) for name, values in stations.items()}}
            else:
                stations.clear()
                yield {"type": "reset", "asOf": as_of}
        else:
            raise ValueError("Unknown message type")
