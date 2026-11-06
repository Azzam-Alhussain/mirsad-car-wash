import unittest

from vision_service.logic import BayLifecycle, classify_vehicle, point_in_polygon


class LogicTests(unittest.TestCase):
    def test_polygon_contains_only_interior_points(self):
        square = [(0.1, 0.1), (0.5, 0.1), (0.5, 0.8), (0.1, 0.8)]
        self.assertTrue(point_in_polygon((0.3, 0.4), square))
        self.assertFalse(point_in_polygon((0.8, 0.4), square))

    def test_classification_uses_class_and_calibrated_area(self):
        self.assertEqual(classify_vehicle("bus", 0.01, 0.03, 0.09), "large")
        self.assertEqual(classify_vehicle("car", 0.04, 0.03, 0.09), "medium")
        self.assertEqual(classify_vehicle("car", 0.10, 0.03, 0.09), "large")
        self.assertEqual(classify_vehicle("car", 0.02, 0.03, 0.09), "small")

    def test_entry_requires_consecutive_frames(self):
        lifecycle = BayLifecycle("CAM-1", entry_frames=3, id_factory=lambda: "abc")
        self.assertIsNone(lifecycle.update(4, 1, "small", 0.8))
        self.assertIsNone(lifecycle.update(4, 1, "small", 0.9))
        event = lifecycle.update(4, 1, "small", 1.0)
        self.assertIsNotNone(event)
        self.assertEqual(event.phase, "entry")
        self.assertEqual(event.tracking_id, "CAM-1-4-abc")
        self.assertAlmostEqual(event.confidence, 0.9)

    def test_exit_requires_consecutive_outside_frames(self):
        lifecycle = BayLifecycle("CAM-1", entry_frames=1, exit_frames=2, id_factory=lambda: "abc")
        lifecycle.update(7, 2, "medium", 0.95)
        self.assertIsNone(lifecycle.update(7, None, "medium", 0.95))
        event = lifecycle.update(7, None, "medium", 0.95)
        self.assertEqual(event.phase, "exit")
        self.assertIsNone(lifecycle.update(7, None, "medium", 0.95))

    def test_tracker_id_reuse_gets_new_operation_id(self):
        ids = iter(["first", "second"])
        lifecycle = BayLifecycle("CAM-1", entry_frames=1, exit_frames=1, id_factory=lambda: next(ids))
        first = lifecycle.update(3, 1, "small", 0.9)
        lifecycle.update(3, None, "small", 0.9)
        lifecycle.retire(3)
        second = lifecycle.update(3, 1, "small", 0.9)
        self.assertNotEqual(first.tracking_id, second.tracking_id)


if __name__ == "__main__":
    unittest.main()
