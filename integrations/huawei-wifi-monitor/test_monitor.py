import tempfile
import unittest
from pathlib import Path

from monitor import connected_macs, normalized_mac, observe, save_state, load_state


def empty():
    return {"online": None, "candidate": None, "candidate_since": None, "pending": []}


class HuaweiMonitorTests(unittest.TestCase):
    def test_mac_normalization_and_host_list(self):
        self.assertEqual(normalized_mac("aa:bb:cc:dd:ee:ff"), "AABBCCDDEEFF")
        hosts = {"Hosts": {"Host": [{"MacAddress": "AA:BB:CC:DD:EE:FF"}]}}
        self.assertEqual(connected_macs(hosts), {"AABBCCDDEEFF"})
        self.assertEqual(connected_macs({"Hosts": {"Host": None}}), set())
        with self.assertRaises(ValueError):
            connected_macs({})
        with self.assertRaises(ValueError):
            connected_macs({"Hosts": {"Host": [{"Hostname": "iPhone"}]}})

    def test_initial_state_does_not_alert(self):
        state = empty()
        self.assertFalse(observe(state, True, 100, 30))
        self.assertEqual(state["online"], True)
        self.assertEqual(state["pending"], [])

    def test_confirm_changes_and_ignore_short_disconnect(self):
        state = empty()
        observe(state, True, 100, 30)
        observe(state, False, 110, 30)
        observe(state, True, 120, 30)
        self.assertEqual(state["pending"], [])
        observe(state, False, 130, 30)
        self.assertFalse(observe(state, False, 150, 30))
        self.assertTrue(observe(state, False, 160, 30))
        self.assertEqual(len(state["pending"]), 1)
        self.assertEqual(state["pending"][0]["state"], "disconnected")
        self.assertFalse(observe(state, True, 170, 30))
        self.assertTrue(observe(state, True, 180, 30))
        self.assertEqual(len(state["pending"]), 2)
        self.assertEqual(state["pending"][1]["state"], "connected")
        self.assertNotEqual(state["pending"][0]["event_id"], state["pending"][1]["event_id"])

    def test_restart_preserves_queue(self):
        state = empty()
        observe(state, False, 100, 30)
        observe(state, True, 110, 30)
        observe(state, True, 120, 30)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            save_state(path, state)
            recovered = load_state(path)
            self.assertEqual(recovered["online"], True)
            self.assertEqual(recovered["pending"], state["pending"])


if __name__ == "__main__":
    unittest.main()
