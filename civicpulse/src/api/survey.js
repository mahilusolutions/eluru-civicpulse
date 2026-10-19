import client, { unwrap } from './client';

export function getSurveys() {
  return client.get('/surveys').then(unwrap);
}

export function createSurvey(payload) {
  return client.post('/surveys', payload).then(unwrap);
}

export function deleteSurvey(id) {
  return client.delete(`/surveys/${id}`).then(unwrap);
}

export function createSurveyResponse(surveyId, payload) {
  return client.post(`/surveys/${surveyId}/responses`, payload).then(unwrap);
}
