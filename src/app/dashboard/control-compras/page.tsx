import { getControlComprasDataAction } from './actions'
import ControlComprasClient from './ControlComprasClient'

export const dynamic = 'force-dynamic'

export default async function ControlComprasPage() {
  const initial = await getControlComprasDataAction(90)
  return <ControlComprasClient initial={initial} />
}
