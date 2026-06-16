const accountModel = require("../models/account.model")
const transactionModel = require("../models/transaction.model")

function serializeCsv(rows) {
    return rows
        .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n")
}

async function getReportSummaryController(req, res) {
    const accountIds = (await accountModel.find({ user: req.user._id }).select("_id")).map((account) => account._id)
    const transactions = await transactionModel.find({
        $or: [
            { fromAccount: { $in: accountIds } },
            { toAccount: { $in: accountIds } }
        ]
    })

    const summary = transactions.reduce((acc, transaction) => {
        acc.totalVolume += transaction.amount
        acc.byType[ transaction.type ] = (acc.byType[ transaction.type ] || 0) + transaction.amount
        acc.flagged += transaction.flagged ? 1 : 0
        return acc
    }, {
        totalVolume: 0,
        flagged: 0,
        byType: {}
    })

    return res.status(200).json({
        summary,
        count: transactions.length
    })
}

async function exportTransactionsCsvController(req, res) {
    const { status, type, accountId, startDate, endDate, minAmount, maxAmount } = req.query
    const accountIds = (await accountModel.find({ user: req.user._id }).select("_id")).map((account) => account._id)

    const query = {
        $or: [
            { fromAccount: { $in: accountIds } },
            { toAccount: { $in: accountIds } }
        ]
    }

    if (status) {
        query.status = status
    }

    if (type) {
        query.type = type
    }

    if (accountId) {
        query.$or = [
            { fromAccount: accountId },
            { toAccount: accountId }
        ]
    }

    if (startDate || endDate) {
        query.createdAt = {}
        if (startDate) {
            query.createdAt.$gte = new Date(startDate)
        }
        if (endDate) {
            query.createdAt.$lte = new Date(endDate)
        }
    }

    if (minAmount || maxAmount) {
        query.amount = {}
        if (minAmount) {
            query.amount.$gte = Number(minAmount)
        }
        if (maxAmount) {
            query.amount.$lte = Number(maxAmount)
        }
    }

    const transactions = await transactionModel.find(query)
        .populate("fromAccount", "accountNumber nickname")
        .populate("toAccount", "accountNumber nickname")
        .sort({ createdAt: -1 })

    const csv = serializeCsv([
        [ "Date", "Type", "Status", "Amount", "From Account", "To Account", "Flagged", "Flag Reason", "Note" ],
        ...transactions.map((transaction) => ([
            transaction.createdAt.toISOString(),
            transaction.type,
            transaction.status,
            transaction.amount,
            transaction.fromAccount?.accountNumber || "",
            transaction.toAccount?.accountNumber || "",
            transaction.flagged ? "YES" : "NO",
            transaction.flagReason,
            transaction.note
        ]))
    ])

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", "attachment; filename=transactions-report.csv")
    return res.status(200).send(csv)
}

async function exportStatementPdfController(req, res) {
    const { accountId } = req.params

    try {
        const account = await accountModel.findOne({
            _id: accountId,
            user: req.user._id
        })

        if (!account) {
            return res.status(404).json({ message: "Account not found" })
        }

        const ledgerModel = require("../models/ledger.model")
        const ledgerEntries = await ledgerModel.find({ account: account._id })
            .populate({
                path: "transaction",
                populate: [
                    { path: "fromAccount", select: "accountNumber nickname" },
                    { path: "toAccount", select: "accountNumber nickname" },
                    { path: "initiatedBy", select: "name email" }
                ]
            })
            .sort({ _id: -1 })
            .limit(100)
            .lean()

        const currentBalance = await account.getBalance()
        let runningBalance = currentBalance

        const statement = ledgerEntries.map((entry) => {
            const enrichedEntry = {
                ...entry,
                runningBalance
            }
            runningBalance = entry.type === "CREDIT"
                ? runningBalance - entry.amount
                : runningBalance + entry.amount
            return enrichedEntry
        })

        const PDFDocument = require("pdfkit")
        const doc = new PDFDocument({ margin: 50 })

        res.setHeader("Content-Type", "application/pdf")
        res.setHeader("Content-Disposition", `attachment; filename=statement-${account.accountNumber}.pdf`)
        doc.pipe(res)

        // Draw PDF Header
        doc.fillColor("#1f2937").font("Helvetica-Bold").fontSize(20).text("LEDGER BANK", { align: "left" })
        doc.font("Helvetica").fontSize(10).fillColor("#4b5563").text("Digital Operations Console | Statement of Account", { align: "left" })
        doc.moveDown()

        doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(50, 90).lineTo(550, 90).stroke()
        doc.moveDown(2)

        // Draw Account Info Grid
        doc.fontSize(11).fillColor("#1f2937").font("Helvetica-Bold")
        doc.text("Customer Details", 50, 110)
        doc.font("Helvetica").fontSize(10)
        doc.text(`Name: ${req.user.name}`, 50, 125)
        doc.text(`Email: ${req.user.email}`, 50, 140)

        doc.font("Helvetica-Bold").fontSize(11)
        doc.text("Account Summary", 320, 110)
        doc.font("Helvetica").fontSize(10)
        doc.text(`Account No: ${account.accountNumber}`, 320, 125)
        doc.text(`Nickname: ${account.nickname}`, 320, 140)
        doc.text(`Balance: INR ${currentBalance.toFixed(2)}`, 320, 155)

        doc.moveDown(3)
        doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(50, 180).lineTo(550, 180).stroke()

        // Table Header
        let y = 205
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#374151")
        doc.text("Date", 50, y)
        doc.text("Type", 140, y)
        doc.text("Description / Note", 210, y)
        doc.text("Amount (INR)", 380, y, { width: 80, align: "right" })
        doc.text("Balance (INR)", 470, y, { width: 80, align: "right" })

        doc.strokeColor("#9ca3af").lineWidth(1).moveTo(50, y + 15).lineTo(550, y + 15).stroke()

        y += 25
        doc.font("Helvetica").fontSize(9).fillColor("#4b5563")

        statement.forEach((entry) => {
            if (y > 700) {
                doc.addPage()
                y = 50
                doc.font("Helvetica-Bold").fontSize(10).fillColor("#374151")
                doc.text("Date", 50, y)
                doc.text("Type", 140, y)
                doc.text("Description / Note", 210, y)
                doc.text("Amount (INR)", 380, y, { width: 80, align: "right" })
                doc.text("Balance (INR)", 470, y, { width: 80, align: "right" })
                doc.strokeColor("#9ca3af").lineWidth(1).moveTo(50, y + 15).lineTo(550, y + 15).stroke()
                y += 25
                doc.font("Helvetica").fontSize(9).fillColor("#4b5563")
            }

            const dateStr = new Date(entry.transaction?.createdAt || Date.now()).toLocaleDateString("en-IN")
            const typeStr = entry.type
            const noteStr = entry.transaction?.note || "Payment transaction"
            const amtStr = entry.amount.toFixed(2)
            const balStr = entry.runningBalance.toFixed(2)

            doc.text(dateStr, 50, y)
            doc.text(typeStr, 140, y)
            doc.text(noteStr.substring(0, 24), 210, y)
            doc.text(amtStr, 380, y, { width: 80, align: "right" })
            doc.text(balStr, 470, y, { width: 80, align: "right" })

            doc.strokeColor("#f3f4f6").lineWidth(1).moveTo(50, y + 15).lineTo(550, y + 15).stroke()

            y += 22
        })

        // Draw Footer
        doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(50, 720).lineTo(550, 720).stroke()
        doc.font("Helvetica").fontSize(8).fillColor("#9ca3af").text("This is a computer-generated bank statement and does not require a physical signature.", 50, 730, { align: "center" })

        doc.end()
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to generate statement PDF" })
    }
}

module.exports = {
    getReportSummaryController,
    exportTransactionsCsvController,
    exportStatementPdfController
}
