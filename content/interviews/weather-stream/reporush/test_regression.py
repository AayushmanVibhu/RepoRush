import unittest

from interview.weather import process_events


def sample(station, timestamp, temperature):
    return {"type": "sample", "stationName": station, "timestamp": timestamp, "temperature": temperature}


def control(command):
    return {"type": "control", "command": command}


class WeatherTests(unittest.TestCase):
    def test_extrema_resets_and_snapshot_independence(self):
        events = [control("snapshot"), sample("A", 1, -5), sample("A", 2, 3),
                  sample("B", 3, 8), control("snapshot"), control("reset"),
                  control("snapshot"), sample("A", 4, 20), control("snapshot")]
        self.assertEqual(list(process_events(iter(events))), [
            {"type": "snapshot", "asOf": 3, "stations": {"A": {"high": 3, "low": -5}, "B": {"high": 8, "low": 8}}},
            {"type": "reset", "asOf": 3},
            {"type": "snapshot", "asOf": 4, "stations": {"A": {"high": 20, "low": 20}}},
        ])

    def test_is_lazy_and_does_not_consume_past_requested_snapshot(self):
        def events():
            yield sample("A", 1, 10)
            yield control("snapshot")
            raise AssertionError("Consumed input beyond first output")
        output = process_events(events())
        self.assertEqual(next(output)["asOf"], 1)

    def test_unknown_messages_raise(self):
        for event in [{"type": "unknown"}, {"type": "control", "command": "unknown"}]:
            with self.assertRaises((ValueError, RuntimeError)):
                list(process_events([event]))


if __name__ == "__main__":
    unittest.main()
