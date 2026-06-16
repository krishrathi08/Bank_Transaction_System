const accountModel = require("../models/account.model")
const ledgerModel = require("../models/ledger.model")

async function createAccountController(req, res) {
    const user = req.user
    const existingAccounts = await accountModel.countDocuments({ user: user._id })

    const account = await accountModel.create({
        user: user._id,
        nickname: existingAccounts === 0 ? "Primary Account" : `Reserve Account ${existingAccounts}`
    })

    res.status(201).json({
        account
    })
}

async function getUserAccountsController(req, res) {
    const accounts = await accountModel.find({ user: req.user._id }).sort({ createdAt: -1 })

    res.status(200).json({
        accounts
    })
}

async function getAccountBalanceController(req, res) {
    const { accountId } = req.params

    const account = await accountModel.findOne({
        _id: accountId,
        user: req.user._id
    })

    if (!account) {
        return res.status(404).json({
            message: "Account not found"
        })
    }

    const balance = await account.getBalance()

    res.status(200).json({
        accountId: account._id,
        balance
    })
}

async function updateAccountController(req, res) {
    const { accountId } = req.params
    const { nickname } = req.body

    const account = await accountModel.findOneAndUpdate(
        { _id: accountId, user: req.user._id },
        { nickname },
        { new: true }
    )

    if (!account) {
        return res.status(404).json({
            message: "Account not found"
        })
    }

    return res.status(200).json({
        account
    })
}

async function getAccountStatementController(req, res) {
    const { accountId } = req.params
    const { limit = 50 } = req.query

    const account = await accountModel.findOne({
        _id: accountId,
        user: req.user._id
    })

    if (!account) {
        return res.status(404).json({
            message: "Account not found"
        })
    }

    const ledgerEntries = await ledgerModel.find({ account: account._id })
        .populate({
            path: "transaction",
            populate: [
                { path: "fromAccount", select: "accountNumber nickname" },
                { path: "toAccount", select: "accountNumber nickname" },
                { path: "initiatedBy", select: "name email role" }
            ]
        })
        .sort({ _id: -1 })
        .limit(Number(limit))
        .lean()

    let runningBalance = await account.getBalance()
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

    return res.status(200).json({
        account,
        statement
    })
}

module.exports = {
    createAccountController,
    getUserAccountsController,
    getAccountBalanceController,
    updateAccountController,
    getAccountStatementController
}
