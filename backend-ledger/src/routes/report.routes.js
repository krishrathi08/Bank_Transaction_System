const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const reportController = require("../controllers/report.controller")

const router = express.Router()

router.get("/summary", authMiddleware.authMiddleware, reportController.getReportSummaryController)
router.get("/transactions.csv", authMiddleware.authMiddleware, reportController.exportTransactionsCsvController)
router.get("/statement/pdf/:accountId", authMiddleware.authMiddleware, reportController.exportStatementPdfController)

module.exports = router
