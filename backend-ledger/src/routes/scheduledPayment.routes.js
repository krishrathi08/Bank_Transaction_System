const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const scheduledPaymentController = require("../controllers/scheduledPayment.controller")

const router = express.Router()

router.post("/", authMiddleware.authMiddleware, scheduledPaymentController.createScheduledPaymentController)
router.get("/", authMiddleware.authMiddleware, scheduledPaymentController.listScheduledPaymentsController)
router.patch("/:scheduleId/status", authMiddleware.authMiddleware, scheduledPaymentController.updateScheduledPaymentStatusController)
router.post("/process-due", authMiddleware.authMiddleware, scheduledPaymentController.processDueScheduledPaymentsController)

module.exports = router
