const beneficiaryModel = require("../models/beneficiary.model")
const accountModel = require("../models/account.model")

async function createBeneficiaryController(req, res) {
    const { accountId, nickname, bankName = "Ledger Bank" } = req.body

    const account = await accountModel.findById(accountId)

    if (!account) {
        return res.status(404).json({
            message: "Destination account not found"
        })
    }

    const beneficiary = await beneficiaryModel.create({
        user: req.user._id,
        account: account._id,
        nickname,
        bankName
    })

    return res.status(201).json({
        beneficiary
    })
}

async function listBeneficiariesController(req, res) {
    const beneficiaries = await beneficiaryModel.find({ user: req.user._id })
        .populate("account", "accountNumber nickname currency status")
        .sort({ createdAt: -1 })

    return res.status(200).json({
        beneficiaries
    })
}

async function deleteBeneficiaryController(req, res) {
    const { beneficiaryId } = req.params
    const beneficiary = await beneficiaryModel.findOneAndDelete({
        _id: beneficiaryId,
        user: req.user._id
    })

    if (!beneficiary) {
        return res.status(404).json({
            message: "Beneficiary not found"
        })
    }

    return res.status(200).json({
        message: "Beneficiary removed successfully"
    })
}

module.exports = {
    createBeneficiaryController,
    listBeneficiariesController,
    deleteBeneficiaryController
}
