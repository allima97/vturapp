const CARD_FONT_BASE_URL = '/assets/cards/fonts';
const alegreyaSansRegularUrl = `${CARD_FONT_BASE_URL}/AlegreyaSans-Regular.ttf`;
const alegreyaSansMediumUrl = `${CARD_FONT_BASE_URL}/AlegreyaSans-Medium.ttf`;
const alegreyaSansBoldUrl = `${CARD_FONT_BASE_URL}/AlegreyaSans-Bold.ttf`;
const cormorantGaramondRegularUrl = `${CARD_FONT_BASE_URL}/CormorantGaramond-Regular.ttf`;
const cormorantGaramondMediumUrl = `${CARD_FONT_BASE_URL}/CormorantGaramond-Medium.ttf`;
const cormorantGaramondSemiBoldUrl = `${CARD_FONT_BASE_URL}/CormorantGaramond-SemiBold.ttf`;
const cormorantGaramondBoldUrl = `${CARD_FONT_BASE_URL}/CormorantGaramond-Bold.ttf`;
const dmSerifDisplayRegularUrl = `${CARD_FONT_BASE_URL}/DMSerifDisplay-Regular.ttf`;
const greatVibesRegularUrl = `${CARD_FONT_BASE_URL}/GreatVibes-Regular.ttf`;
const loraRegularUrl = `${CARD_FONT_BASE_URL}/Lora-Regular.ttf`;
const loraBoldUrl = `${CARD_FONT_BASE_URL}/Lora-Bold.ttf`;
const nunitoSansRegularUrl = `${CARD_FONT_BASE_URL}/NunitoSans-Regular.ttf`;
const nunitoSansSemiBoldUrl = `${CARD_FONT_BASE_URL}/NunitoSans-SemiBold.ttf`;
const nunitoSansBoldUrl = `${CARD_FONT_BASE_URL}/NunitoSans-Bold.ttf`;
const parisienneRegularUrl = `${CARD_FONT_BASE_URL}/Parisienne-Regular.ttf`;
const playfairDisplayRegularUrl = `${CARD_FONT_BASE_URL}/PlayfairDisplay-Regular.ttf`;
const playfairDisplayBoldUrl = `${CARD_FONT_BASE_URL}/PlayfairDisplay-Bold.ttf`;

export function buildCardFontFaceCss() {
  return `
@font-face {
  font-family: 'Alegreya Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${alegreyaSansRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Alegreya Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('${alegreyaSansMediumUrl}') format('truetype');
}
@font-face {
  font-family: 'Alegreya Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${alegreyaSansBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${cormorantGaramondRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('${cormorantGaramondMediumUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${cormorantGaramondSemiBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Cormorant Garamond';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${cormorantGaramondBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'DM Serif Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${dmSerifDisplayRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Great Vibes';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${greatVibesRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${loraRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${loraBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Nunito Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${nunitoSansRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Nunito Sans';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${nunitoSansSemiBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Nunito Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${nunitoSansBoldUrl}') format('truetype');
}
@font-face {
  font-family: 'Parisienne';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${parisienneRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${playfairDisplayRegularUrl}') format('truetype');
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${playfairDisplayBoldUrl}') format('truetype');
}
svg {
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
}
`.trim();
}
