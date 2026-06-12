import { colors } from '../../theme';

export const FONT = {
    regular: { fontFamily: 'Inter_400Regular' },
    medium: { fontFamily: 'Inter_500Medium' },
    semibold: { fontFamily: 'Inter_600SemiBold' },
    bold: { fontFamily: 'Inter_700Bold' },
    heavy: { fontFamily: 'Inter_800ExtraBold' },
};

export const COACH_ILLUSTRATIONS = {
    medsMeal: require('../../../assets/meds_meal_illus.jpg'),
    eatEarly: require('../../../assets/eat_early_illus.jpg'),
    ricePortion: require('../../../assets/rice_portion_illus.jpg'),
};

export const getDriverColor = (pct) => {
    if (pct >= 75) return colors.success;
    if (pct >= 50) return colors.warning;
    return colors.danger;
};
