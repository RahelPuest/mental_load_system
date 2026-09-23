import { endpoints } from '../lib/api.js'
import { useSession } from '../lib/session.js'
import { relativeDays, useAsync } from '../lib/ui.js'
import { Actions, Button, Chip, Chips, Divider, EmptyState, Icon, Notice, Panel, SkeletonList, useToast,
  ICON,
} from '../design/index.js'

const PRIORITY_TONE: Record<string, 'attention' | 'info' | 'neutral'> = {
  critical: 'attention',
  high: 'attention',
  normal: 'info',
  low: 'neutral',
}

/**
 * §28: Benachrichtigungen wurden bislang erzeugt und nie angezeigt.
 *
 * Wichtig ist das Versprechen aus §28.1: Ein ignorierter oder unterdrückter Reminder darf
 * nichts verlieren. Deshalb stehen hier auch die Nachrichten, die absichtlich keinen Push
 * ausgelöst haben – mit dem Grund dafür.
 */
export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { household } = useSession()
  const toast = useToast()
  const list = useAsync(
    () => (household && open ? endpoints.notifications(household.id) : Promise.resolve(null)),
    [household?.id, open],
  )

  if (!open) return null

  return (
    <div className="popover" role="dialog" aria-label="Benachrichtigungen">
      <header className="popover-head">
        <p className="t-sub">Benachrichtigungen</p>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Schließen">
          <Icon name="plus" size={ICON.md} style={{ transform: 'rotate(45deg)' }} />
        </Button>
      </header>
      <div className="popover-body">
      {!list.data ? (
        <SkeletonList count={2} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Nichts gemeldet"
          description="Thealotta meldet sich nur, wenn es einen konkreten Anlass gibt. Was du hier nicht siehst, war auch nichts."
        />
      ) : (
        <>
          <Notice tone="quiet">{list.data.note}</Notice>

          <Panel>
            {list.data.items.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <Divider />}
                <div className="setting-row">
                  <div className="text">
                    <p className="t-sub">{item.title}</p>
                    {item.body && <p className="t-body-sm desc">{item.body}</p>}
                    <Chips>
                      <Chip tone={PRIORITY_TONE[item.priority] ?? 'neutral'}>{relativeDays(item.createdAt)}</Chip>
                      {item.state === 'suppressed' && (
                        <Chip tone="info">
                          leise zugestellt{item.suppressedReason ? ` · ${item.suppressedReason}` : ''}
                        </Chip>
                      )}
                      {item.readAt === null && <Chip tone="attention">neu</Chip>}
                    </Chips>
                  </div>
                  {item.readAt === null && household && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await endpoints.ackNotification(household.id, item.id)
                        await list.reload()
                      }}
                    >
                      Gelesen
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Panel>

          {list.data.unread > 0 && household && (
            <Actions end>
              <Button
                onClick={async () => {
                  await endpoints.readAllNotifications(household.id)
                  toast.show('Alles als gelesen markiert.')
                  await list.reload()
                }}
              >
                Alle als gelesen markieren
              </Button>
            </Actions>
          )}
        </>
      )}
      </div>
    </div>
  )
}
