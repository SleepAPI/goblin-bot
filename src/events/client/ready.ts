import type { ClientEvent } from '@/events/types';
import { startRecruitThreadAutoCloser } from '@/recruit/autoCloseScheduler';
import { logger } from '@/utils/logger';

const event: ClientEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,
  execute(client) {
    client.user?.setPresence({
      activities: [{ name: 'clashing with goblins' }],
      status: 'online'
    });
    startRecruitThreadAutoCloser(client);

    logger.info(
      {
        user: client.user?.tag,
        id: client.user?.id
      },
      'Bot ready'
    );
  }
};

export default event;
