const transactionModel = require("../models/transaction.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const { executeTransaction } = require("../services/transaction.service")

async function createTransaction(req, res) {
    const { fromAccount, toAccount, amount, idempotencyKey, note = "" } = req.body

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    const ownedAccount = await accountModel.findOne({
        _id: fromAccount,
        user: req.user._id
    })

    if (!ownedAccount) {
        return res.status(403).json({
            message: "You can transfer only from your own active accounts"
        })
    }

    const balance = await ownedAccount.getBalance()
    if (balance < Number(amount)) {
        return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}.`
        })
    }

    const destinationAccount = await accountModel.findById(toAccount)
    if (!destinationAccount) {
        return res.status(404).json({
            message: "Destination account not found"
        })
    }

    const existingTransaction = await transactionModel.findOne({ idempotencyKey })
    if (existingTransaction) {
        return res.status(200).json({
            message: "Transaction already processed",
            transaction: existingTransaction
        })
    }

    const userModel = require("../models/user.model")
    const user = await userModel.findById(req.user._id)
    const code = String(Math.floor(100000 + Math.random() * 900000))

    user.otpCode = code
    user.otpExpires = Date.now() + 300000 // 5 minutes
    await user.save()

    try {
        await emailService.sendOtpEmail(user.email, user.name, code, amount, destinationAccount.accountNumber)
    } catch (error) {
        console.error("Send transaction OTP email failed:", error)
    }

    try {
        const transaction = await transactionModel.create({
            initiatedBy: req.user._id,
            fromAccount,
            toAccount,
            amount: Number(amount),
            note,
            type: "TRANSFER",
            source: "MANUAL",
            idempotencyKey,
            status: "PENDING_OTP"
        })

        return res.status(202).json({
            message: "OTP verification required",
            status: "PENDING_OTP",
            transaction
        })
    } catch (error) {
        return res.status(400).json({
            message: error.message || "Transaction initiation failed"
        })
    }
}

async function createDepositController(req, res) {
    const { toAccount, amount, idempotencyKey, note = "" } = req.body

    const ownedAccount = await accountModel.findOne({
        _id: toAccount,
        user: req.user._id
    })

    if (!ownedAccount) {
        return res.status(403).json({
            message: "You can deposit only into your own account"
        })
    }

    try {
        const { transaction } = await executeTransaction({
            initiatedBy: req.user._id,
            toAccountId: toAccount,
            amount: Number(amount),
            note,
            idempotencyKey,
            type: "DEPOSIT",
            source: "MANUAL"
        })

        return res.status(201).json({
            message: "Deposit completed successfully",
            transaction
        })
    } catch (error) {
        return res.status(400).json({
            message: error.message || "Deposit failed"
        })
    }
}

async function createWithdrawalController(req, res) {
    const { fromAccount, amount, idempotencyKey, note = "" } = req.body

    const ownedAccount = await accountModel.findOne({
        _id: fromAccount,
        user: req.user._id
    })

    if (!ownedAccount) {
        return res.status(403).json({
            message: "You can withdraw only from your own account"
        })
    }

    try {
        const { transaction } = await executeTransaction({
            initiatedBy: req.user._id,
            fromAccountId: fromAccount,
            amount: Number(amount),
            note,
            idempotencyKey,
            type: "WITHDRAWAL",
            source: "MANUAL"
        })

        return res.status(201).json({
            message: "Withdrawal completed successfully",
            transaction
        })
    } catch (error) {
        return res.status(400).json({
            message: error.message || "Withdrawal failed"
        })
    }
}

async function getUserTransactionsController(req, res) {
    const { status, type, accountId, flagged, startDate, endDate, minAmount, maxAmount, limit = 100 } = req.query
    const accountIds = (await accountModel.find({ user: req.user._id }).select("_id")).map((item) => item._id)

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

    if (flagged === "true") {
        query.flagged = true
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
        .populate("fromAccount", "accountNumber nickname currency")
        .populate("toAccount", "accountNumber nickname currency")
        .populate("initiatedBy", "name email role")
        .sort({ createdAt: -1 })
        .limit(Number(limit))

    return res.status(200).json({
        transactions
    })
}

async function getFraudAlertsController(req, res) {
    const accountIds = (await accountModel.find({ user: req.user._id }).select("_id")).map((item) => item._id)

    const transactions = await transactionModel.find({
        flagged: true,
        $or: [
            { fromAccount: { $in: accountIds } },
            { toAccount: { $in: accountIds } }
        ]
    })
        .populate("fromAccount", "accountNumber nickname")
        .populate("toAccount", "accountNumber nickname")
        .sort({ createdAt: -1 })

    return res.status(200).json({
        alerts: transactions
    })
}

async function createInitialFundsTransaction(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body

    try {
        const { transaction } = await executeTransaction({
            initiatedBy: req.user._id,
            fromAccountId: null,
            toAccountId: toAccount,
            amount: Number(amount),
            idempotencyKey,
            type: "DEPOSIT",
            source: "SYSTEM"
        })

        return res.status(201).json({
            message: "Initial funds transaction completed successfully",
            transaction
        })
    } catch (error) {
        return res.status(400).json({
            message: error.message || "Initial funding failed"
        })
    }
}

async function verifyOtpController(req, res) {
    const { transactionId, otp } = req.body

    if (!transactionId || !otp) {
        return res.status(400).json({ message: "TransactionId and OTP are required" })
    }

    const userModel = require("../models/user.model")
    const ledgerModel = require("../models/ledger.model")
    const mongoose = require("mongoose")

    const user = await userModel.findById(req.user._id).select("+otpCode +otpExpires")
    if (!user || user.otpCode !== otp || !user.otpExpires || user.otpExpires < new Date()) {
        return res.status(400).json({ message: "Invalid or expired OTP code" })
    }

    const transaction = await transactionModel.findById(transactionId)
    if (!transaction || transaction.status !== "PENDING_OTP") {
        return res.status(400).json({ message: "Transaction not found or already verified" })
    }

    const fromAccount = await accountModel.findById(transaction.fromAccount)
    const toAccount = await accountModel.findById(transaction.toAccount)

    if (!fromAccount || !toAccount) {
        return res.status(400).json({ message: "Source or destination account not found" })
    }

    if (fromAccount.status !== "ACTIVE" || toAccount.status !== "ACTIVE") {
        return res.status(400).json({ message: "Accounts must be active to complete transfer" })
    }

    const balance = await fromAccount.getBalance()
    if (balance < transaction.amount) {
        transaction.status = "FAILED"
        await transaction.save()
        return res.status(400).json({ message: "Insufficient balance to complete transaction" })
    }

    // Clear user OTP
    user.otpCode = undefined
    user.otpExpires = undefined
    await user.save()

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
        transaction.status = "COMPLETED"
        await transaction.save({ session })

        await ledgerModel.create([ {
            account: fromAccount._id,
            amount: transaction.amount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], { session })

        await ledgerModel.create([ {
            account: toAccount._id,
            amount: transaction.amount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], { session })

        await session.commitTransaction()
        await session.endSession()

        try {
            await emailService.sendTransactionEmail(req.user.email, req.user.name, transaction.amount, toAccount.accountNumber)
        } catch (error) {
            console.error("OTP success email failed:", error)
        }

        return res.status(200).json({
            message: "Transaction completed successfully",
            transaction
        })
    } catch (error) {
        await session.abortTransaction()
        await session.endSession()
        return res.status(500).json({
            message: error.message || "Failed to finalize transaction"
        })
    }
}

module.exports = {
    createTransaction,
    createDepositController,
    createWithdrawalController,
    getUserTransactionsController,
    getFraudAlertsController,
    createInitialFundsTransaction,
    verifyOtpController
}
