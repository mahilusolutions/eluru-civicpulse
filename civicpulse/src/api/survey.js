import client, { unwrap } from './client';

export function getSurveys() {
  return client.get('/surveys').then(unwrap);
}

export function createSurveyResponse(surveyId, payload) {
  return client.post(`/surveys/${surveyId}/responses`, payload).then(unwrap);
}
