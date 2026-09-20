import { i18n } from '../../i18n';

/** A number with a fixed count of decimals, in the language's own way of writing it (§8.4). */
function fixed(value: number, digits: number): string {
  return new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);
}

export const formatSeconds = (ms: number): string =>
  i18n.t('common.seconds', { value: fixed(ms / 1000, 1) });

export const formatPercent = (ratio: number): string =>
  i18n.t('common.percent', { value: fixed(ratio * 100, 1) });

export const formatMs = (ms: number): string =>
  i18n.t('common.milliseconds', { value: fixed(ms, 1) });
