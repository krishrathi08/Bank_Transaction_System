const scheduledPaymentModel = require("../models/scheduledPayment.model")
const { executeTransaction, computeNextRunAt } = require("../services/transaction.service")

async function createScheduledPaymentController(req, res) {
    const { fromAccount, toAccount, amount, note = "", frequency = "ONCE", nextRunAt } = req.body

    const schedule = await scheduledPaymentModel.create({
        user: req.user._id,
        fromAccount,
        toAccount,
        amount,
        note,
        frequency,
        nextRunAt
    })

    return res.status(201).json({
        schedule
    })
}

async function listScheduledPaymentsController(req, res) {
    const schedules = await scheduledPaymentModel.find({ user: req.user._id })
        .populate("fromAccount", "accountNumber nickname currency")
        .populate("toAccount", "accountNumber nickname currency")
        .sort({ nextRunAt: 1 })

    return res.status(200).json({
        schedules
    })
}

async function updateScheduledPaymentStatusController(req, res) {
    const { scheduleId } = req.params
    const { status } = req.body

    const schedule = await scheduledPaymentModel.findOneAndUpdate(
        { _id: scheduleId, user: req.user._id },
        { status },
        { new: true }
    )

    if (!schedule) {
        return res.status(404).json({
            message: "Scheduled payment not found"
        })
    }

    return res.status(200).json({
        schedule
    })
}

async function processDueScheduledPaymentsController(req, res) {
    const dueSchedules = await scheduledPaymentModel.find({
        user: req.user._id,
        status: "ACTIVE",
        nextRunAt: { $lte: new Date() }
    })

    const processed = []

    for (const schedule of dueSchedules) {
        const idempotencyKey = `${schedule._id}-${Date.now()}`
        const result = await executeTransaction({
            initiatedBy: req.user._id,
            fromAccountId: schedule.fromAccount,
            toAccountId: schedule.toAccount,
            amount: Number(schedule.amount),
            note: schedule.note,
            idempotencyKey,
            type: "TRANSFER",
            source: schedule.frequency === "ONCE" ? "SCHEDULED" : "RECURRING"
        })

        schedule.lastRunAt = new Date()
        const nextRunAt = computeNextRunAt(schedule.nextRunAt, schedule.frequency)
        schedule.nextRunAt = nextRunAt || schedule.nextRunAt

        if (!nextRunAt) {
            schedule.status = "COMPLETED"
        }

        await schedule.save()
        processed.push(result.transaction)
    }

    return res.status(200).json({
        processedCount: processed.length,
        transactions: processed
    })
}

module.exports = {
    createScheduledPaymentController,
    listScheduledPaymentsController,
    updateScheduledPaymentStatusController,
    processDueScheduledPaymentsController
}
