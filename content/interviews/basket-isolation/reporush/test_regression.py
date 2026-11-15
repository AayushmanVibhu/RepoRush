import unittest

from basket.basket import Basket
from basket.product import Product
from basket.promotion import Promotion


class BasketIsolationTests(unittest.TestCase):
    def test_catalog_and_baskets_remain_independent(self):
        catalog = {"apples": Product("apples", 100, "bag")}
        promotion = Promotion({
            "id": 1, "title": "10 percent off", "qualifying_product": "apples",
            "qualifying_qty": 1, "discounted_product": "apples", "discount_percent": 10,
        })
        discounted = Basket(catalog, [promotion])
        regular = Basket(catalog, [])
        self.assertTrue(discounted.add("APPLES"))
        self.assertTrue(regular.add("apples"))
        discounted.calculate_discounts()
        self.assertEqual(discounted.total, 90)
        self.assertEqual(regular.total, 100)
        self.assertFalse(catalog["apples"].has_promotion)
        self.assertIsNot(discounted.items[0], regular.items[0])
        discounted.calculate_discounts()
        self.assertEqual(discounted.total, 90)
        self.assertFalse(regular.add("not-in-stock"))


if __name__ == "__main__":
    unittest.main()
