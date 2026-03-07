const mongoose = require("mongoose");


const Messcut = require('../MODEL/Messcut');
/* 🟢 Create a new request */

const dayjs = require("dayjs");

/* ======================================================
   🕐 Normalize Time (handles text ranges)
====================================================== */
function normalizeTime(timeStr) {
  if (!timeStr) return "00:00";
  const str = timeStr.toLowerCase();

  if (str.includes("morning")) return "07:00"; // midpoint of 6–8 AM
  if (str.includes("evening")) return "17:00"; // midpoint of 4–6 PM
  if (str.includes("afternoon")) return "13:30"; // midpoint of 1–3 PM
  if (str.includes("night")) return "20:00"; // midpoint of 8–10 PM

  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const [_, h, m] = match;
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  return "00:00";
}

/* ======================================================
   🧮 Local Time Period Calculation (IST-safe)
====================================================== */
function calculatePeriod(leavingDate, leavingTime, returningDate, returningTime) {
  try {
    if (!leavingDate || !leavingTime || !returningDate || !returningTime) return "-";

    const leaveT = normalizeTime(leavingTime);
    const returnT = normalizeTime(returningTime);

    // ✅ Parse as local time (not UTC)
    const start = dayjs(`${leavingDate} ${leaveT}`, "YYYY-MM-DD HH:mm");
    const end = dayjs(`${returningDate} ${returnT}`, "YYYY-MM-DD HH:mm");

    if (!start.isValid() || !end.isValid() || end.isBefore(start)) return "-";

    const diffMs = end.diff(start);
    const totalHours = diffMs / (1000 * 60 * 60);
    const days = Math.floor(totalHours / 24);
    const hours = Math.floor(totalHours % 24);
    const minutes = Math.round((totalHours * 60) % 60);

    if (days === 0 && hours === 0) return `${minutes} minute(s)`;
    if (days === 0) return `${hours} hour(s) ${minutes ? `${minutes} min(s)` : ""}`.trim();
    return `${days} day(s) ${hours} hour(s)${minutes ? ` ${minutes} min(s)` : ""}`;
  } catch (error) {
    console.error("⛔ Error calculating period:", error);
    return "-";
  }
}

/* ======================================================
   🟢 Controller: Create New Messcut Request
====================================================== */
exports.createMesscutRequest = async (req, res) => {
  try {
    const {
      name,
       feedue,
      admissionNo,
      roomNo,
      leavingDate,
      leavingTime,
      returningDate,
      returningTime,
      reason,
    } = req.body;

    if (!admissionNo || !leavingDate || !reason) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }

    // 🔹 Auto-calculate period
    const period = calculatePeriod(leavingDate, leavingTime, returningDate, returningTime);

    const newReq = new Messcut({
      name,
      admissionNo,
      roomNo,
       feedue,
      leavingDate,
      leavingTime,
      returningDate,
      returningTime,
      reason,
      period, // ✅ store readable duration
    });

    await newReq.save();

    res.status(201).json({
      success: true,
      message: "Request submitted successfully ✅",
      data: newReq,
    });
  } catch (err) {
    console.error("❌ Create Messcut Error:", err);
    res.status(500).json({
      success: false,
      // message: "Server error while submitting request.",
      error: err.message,
    });
  }
};

/* 🟡 Get requests for a specific student */
exports . getMesscutRequestsByStudent = async (req, res) => {
  try {
    const { admissionNo } = req.query;
    if (!admissionNo)
      return res.status(400).json({ success: false, message: "Admission number required." });

    const data = await Messcut.find({ admissionNo }).sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch requests." });
  }
};

/* 🔵 (Admin) Get all requests */
exports. getAllMesscutRequests = async (req, res) => {
  try {
    const data = await Messcut.find().sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/* 🟠 Update status (Approve/Reject) */
exports.updateMesscutStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminRemark, updatedBy } = req.body;

    // ✅ Validate input
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required." });
    }

    // ✅ Ensure status is valid
    const validStatuses = ["Pending", "ACCEPT", "REJECT"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value." });
    }

    // ✅ Perform update
    const updated = await Messcut.findByIdAndUpdate(
      id,
      {
        status,
        adminRemark: adminRemark || "",
        updatedBy: updatedBy || "Admin",
        statusUpdatedAt: new Date(),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "No Mess Cut request found with the provided ID.",
      });
    }

    // ✅ Return success
    res.status(200).json({
      success: true,
      message: `Status updated to '${status}' successfully.`,
      data: updated,
    });
  } catch (err) {
    console.error("❌ Error updating messcut status:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update messcut status. Please try again later.",
    });
  }
};



exports.getMesscutCount = async (req, res) => {
  try {
    const total = await Messcut.countDocuments({});
    const pending = await Messcut.countDocuments({ status: "Pending" });
    const accepted = await Messcut.countDocuments({ status: "ACCEPT" });
    const rejected = await Messcut.countDocuments({ status: "REJECT" });

    return res.status(200).json({
      success: true,
      total,
      pending,
      accepted,
      rejected,
    });
  } catch (err) {
    console.error("❌ Messcut Count Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


exports.getMesscutCounts = async (req, res) => {
  try {
    // ✅ Get India Date Properly (YYYY-MM-DD)
    const indiaDate = new Date().toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // Convert DD/MM/YYYY → YYYY-MM-DD
    const [dd, mm, yyyy] = indiaDate.split("/");
    const today = `${yyyy}-${mm}-${dd}`;

    // ===================================
    // COUNT MESSCUTS
    // ===================================

    const pending = await Messcut.countDocuments({ status: "Pending" });

    const leavingToday = await Messcut.countDocuments({
      leavingDate: today
    });

    const returningToday = await Messcut.countDocuments({
      returningDate: today
    });

    return res.status(200).json({
      success: true,
      today,
      pending,
      leavingToday,
      returningToday,
    });

  } catch (err) {
    console.error("❌ Messcut Count Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
exports.updateParentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { parentStatus } = req.body;

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    // ✅ Validate parentStatus
    if (!["APPROVE", "REJECT"].includes(parentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid parent status value",
      });
    }

    // ✅ Find messcut request
    const request = await Messcut.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Messcut request not found",
      });
    }

    // 🔒 Parent can act only once
    if (request.parentStatus !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Parent has already responded",
      });
    }

    // ✅ Update ONLY parent status
    request.parentStatus = parentStatus;
    request.statusUpdatedAt = new Date();

    await request.save();

    return res.status(200).json({
      success: true,
      message:
        parentStatus === "APPROVE"
          ? "Parent approved the request"
          : "Parent rejected the request",
      data: request,
    });
  } catch (error) {
    console.error("❌ Parent Status Update Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


