import { i18n } from '../../i18n';
import { translateServerMessage } from './error-messages';
import { ApiRequestError, ContractError, NetworkError } from './errors';

/**
 * A sentence to show the player, in their language (§8.4). The API writes its own messages, in
 * English, for the cases it knows (§9.5); the ones this client knows are translated and the rest are
 * shown as they came. A server fault gets a plain description, since its message is only a status.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const message =
      error.status >= 500
        ? i18n.t('errors.serverProblem')
        : (translateServerMessage(error.message) ?? error.message);
    if (error.retryAfterSec !== undefined) {
      return i18n.t('errors.retryIn', { message, count: error.retryAfterSec });
    }
    return message;
  }
  if (error instanceof NetworkError) return i18n.t('errors.unreachable');
  if (error instanceof ContractError) return i18n.t('errors.unexpectedResponse');
  return i18n.t('errors.generic');
}
