import { useMemo, useState } from 'react'
import SearchCombobox from './SearchCombobox'
import { getAvailableTimeZones } from '../../lib/timeZones'
import { buildTimeZoneOptions } from '../../lib/timeZoneOptions'

/**
 * Timezone picker with region grouping, search, live offsets, and current local times.
 * The options are rebuilt when the popover opens so daylight-saving changes stay current.
 */
export default function TimeZoneCombobox({ value, onChange, ...props }) {
  const [now, setNow] = useState(() => new Date())
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const options = useMemo(
    () => buildTimeZoneOptions(now, getAvailableTimeZones(undefined, [localZone, value])),
    [localZone, now, value]
  )

  return (
    <SearchCombobox
      {...props}
      value={value}
      onChange={onChange}
      options={options}
      onOpenChange={open => {
        if (open) setNow(new Date())
      }}
      placeholder="Select a timezone"
      searchPlaceholder="Search city, region, or UTC offset"
      emptyText="No timezone matches that search."
    />
  )
}
