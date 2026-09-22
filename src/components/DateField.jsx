import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

/**
 * Thin wrapper around react-datepicker that speaks ISO strings (YYYY-MM-DD)
 * instead of Date objects, and applies the app's existing input styling.
 */
export default function DateField({ value, onChange, required, placeholder }) {
  const selected = value ? new Date(value + 'T00:00:00') : null

  function handleChange(date) {
    if (!date) { onChange(''); return }
    const iso = date.toISOString().split('T')[0]
    onChange(iso)
  }

  return (
    <DatePicker
      selected={selected}
      onChange={handleChange}
      dateFormat="dd MMM yyyy"
      placeholderText={placeholder || 'dd Mon yyyy'}
      required={required}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      todayButton="Today"
      className="datepicker-input"
      wrapperClassName="datepicker-wrapper"
      popperPlacement="bottom-start"
    />
  )
}
