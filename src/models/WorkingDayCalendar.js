import mongoose from 'mongoose';

const { Schema } = mongoose;

const holidaySchema = new Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    label: { type: String, default: null },
  },
  { _id: false }
);

const workingDayCalendarSchema = new Schema(
  {
    organisation_id: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null, index: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    daily_capacity_hours: { type: Number, default: 8, min: 0 },
    working_days_override: { type: Number, default: null, min: 0 },
    holidays: { type: [holidaySchema], default: [] },
    extra_working_days: { type: [String], default: [] },
    notes: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'working_day_calendars',
  }
);

workingDayCalendarSchema.index({ organisation_id: 1, month: 1 }, { unique: true });

const WorkingDayCalendar = mongoose.model('WorkingDayCalendar', workingDayCalendarSchema);

export default WorkingDayCalendar;
