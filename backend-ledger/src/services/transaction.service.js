const mongoose = require("mongoose")
const transactionModel = require("../models/transaction.model")
const accountModel = require("../models/account.model")
const ledgerModel = require("../models/ledger.model")
const beneficiaryModel = require("../models/beneficiary.model")

function addDays(date, days) {
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + days)
    return nextDate
}

function addMonths(date, months) {
    const nextDate = new Date(date)
    nextDate.setMonth(nextDate.getMonth() + months)
    return nextDate
}

async function deriveFraudFlag({ userId, toAccount, amount }) {
    if (amount >= 100000) {
        return "High value transaction requires review"
    }

    const beneficiary = await beneficiaryModel.findOne({
        user: userId,
        account: toAccount
    })

    if (!beneficiary) {
        return "Transfer to a new beneficiary"
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const recentTransactions = await transactionModel.countDocuments({
        initiatedBy: userId,
        createdAt: { $gte: tenMinutesAgo },
        status: "COMPLETED"
    })

    if (recentTransactions >= 3) {
        return "Multiple transactions in a short period"
    }

    return ""
}

async function executeTransaction({
    initiatedBy,
    fromAccountId = null,
    toAccountId = null,
    amount,
    note = "",
    idempotencyKey,
    type = "TRANSFER",
    source = "MANUAL"
}) {
    if (!initiatedBy || !amount || !idempotencyKey) {
        throw new Error("initiatedBy, amount and idempotencyKey are required")
    }

    if (amount <= 0) {
        throw new Error("Amount must be greater than zero")
    }

    if (type === "TRANSFER" && (!fromAccountId || !toAccountId)) {
        throw new Error("Transfer requires both source and destination accounts")
    }

    if (type === "DEPOSIT" && !toAccountId) {
        throw new Error("Deposit requires a destination account")
    }

    if (type === "WITHDRAWAL" && !fromAccountId) {
        throw new Error("Withdrawal requires a source account")
    }

    const existingTransaction = await transactionModel.findOne({ idempotencyKey })
    if (existingTransaction) {
        return {
            transaction: existingTransaction,
            duplicate: true
        }
    }

    const fromAccount = fromAccountId
        ? await accountModel.findById(fromAccountId)
        : null
    const toAccount = toAccountId
        ? await accountModel.findById(toAccountId)
        : null

    if (fromAccountId && !fromAccount) {
        throw new Error("Source account not found")
    }

    if (toAccountId && !toAccount) {
        throw new Error("Destination account not found")
    }

    if (fromAccount && fromAccount.status !== "ACTIVE") {
        throw new Error("Source account must be active")
    }

    if (toAccount && toAccount.status !== "ACTIVE") {
        throw new Error("Destination account must be active")
    }

    if (fromAccount) {
        const balance = await fromAccount.getBalance()
        if (balance < amount) {
            throw new Error(`Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`)
        }
    }

    const flagReason = type === "TRANSFER"
        ? await deriveFraudFlag({
            userId: initiatedBy,
            toAccount: toAccountId,
            amount
        })
        : ""

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
        const transaction = (await transactionModel.create([ {
            initiatedBy,
            fromAccount: fromAccountId,
            toAccount: toAccountId,
            amount,
            note,
            type,
            source,
            idempotencyKey,
            status: "PENDING",
            flagged: Boolean(flagReason),
            flagReason
        } ], { session }))[ 0 ]

        if (fromAccountId) {
            await ledgerModel.create([ {
                account: fromAccountId,
                amount,
                transaction: transaction._id,
                type: "DEBIT"
            } ], { session })
        }

        if (toAccountId) {
            await ledgerModel.create([ {
                account: toAccountId,
                amount,
                transaction: transaction._id,
                type: "CREDIT"
            } ], { session })
        }

        transaction.status = "COMPLETED"
        await transaction.save({ session })

        await session.commitTransaction()
        await session.endSession()

        return {
            transaction,
            duplicate: false
        }
    } catch (error) {
        await session.abortTransaction()
        await session.endSession()
        throw error
    }
}

function computeNextRunAt(currentDate, frequency) {
    if (frequency === "WEEKLY") {
        return addDays(currentDate, 7)
    }

    if (frequency === "MONTHLY") {
        return addMonths(currentDate, 1)
    }

    return null
}

module.exports = {
    executeTransaction,
    computeNextRunAt
}
