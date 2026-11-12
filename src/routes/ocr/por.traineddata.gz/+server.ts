import { redirect } from '@sveltejs/kit';
import idiomaUrl from '@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz?url';

export function GET() {
  redirect(302, idiomaUrl);
}
