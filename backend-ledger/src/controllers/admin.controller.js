const userModel = require("../models/user.model")
const accountModel = require("../models/account.model")
const transactionModel = require("../models/transaction.model")

async function getAdminOverviewController(req, res) {
    const [ totalUsers, totalAccounts, totalTransactions, flaggedTransactions, recentUsers, accounts ] = await Promise.all([
        userModel.countDocuments(),
        accountModel.countDocuments(),
        transactionModel.countDocuments(),
        transactionModel.countDocuments({ flagged: true }),
        userModel.find().sort({ createdAt: -1 }).limit(10).select("name email role createdAt"),
        accountModel.find().populate("user", "name email role").sort({ createdAt: -1 }).limit(20)
    ])

    return res.status(200).json({
        metrics: {
            totalUsers,
            totalAccounts,
            totalTransactions,
            flaggedTransactions
        },
        recentUsers,
        accounts
    })
}

async function listAdminTransactionsController(req, res) {
    const transactions = await transactionModel.find()
        .populate("fromAccount", "accountNumber nickname")
        .populate("toAccount", "accountNumber nickname")
        .populate("initiatedBy", "name email role")
        .sort({ createdAt: -1 })
        .limit(100)

    return res.status(200).json({
        transactions
    })
}

async function updateAccountStatusController(req, res) {
    const { accountId } = req.params
    const { status } = req.body

    const account = await accountModel.findByIdAndUpdate(
        accountId,
        { status },
        { new: true }
    ).populate("user", "name email")

    if (!account) {
        return res.status(404).json({
            message: "Account not found"
        })
    }

    return res.status(200).json({
        account
    })
}

module.exports = {
    getAdminOverviewController,
    listAdminTransactionsController,
    updateAccountStatusController
}
