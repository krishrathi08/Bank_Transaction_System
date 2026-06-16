const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const adminController = require("../controllers/admin.controller")

const router = express.Router()

router.get("/overview", authMiddleware.authMiddleware, authMiddleware.requireRole("ADMIN"), adminController.getAdminOverviewController)
router.get("/transactions", authMiddleware.authMiddleware, authMiddleware.requireRole("ADMIN"), adminController.listAdminTransactionsController)
router.patch("/accounts/:accountId/status", authMiddleware.authMiddleware, authMiddleware.requireRole("ADMIN"), adminController.updateAccountStatusController)

module.exports = router
