const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const beneficiaryController = require("../controllers/beneficiary.controller")

const router = express.Router()

router.post("/", authMiddleware.authMiddleware, beneficiaryController.createBeneficiaryController)
router.get("/", authMiddleware.authMiddleware, beneficiaryController.listBeneficiariesController)
router.delete("/:beneficiaryId", authMiddleware.authMiddleware, beneficiaryController.deleteBeneficiaryController)

module.exports = router
