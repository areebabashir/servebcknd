import { Router } from "express";
import { protect, requireFullAccess, requireFullAccessOr } from "../middleware/auth.js";
import { getDonations, getDonationStats, createDonation, updateDonation, deleteDonation } from "../controllers/donation.controller.js";

const router = Router();

router.post("/", createDonation);

router.use(protect);
router.get("/", getDonations);
router.get("/stats", getDonationStats);
router.patch("/:id", requireFullAccessOr("president", "finance_head"), updateDonation);
router.delete("/:id", requireFullAccess, deleteDonation);

export default router;
