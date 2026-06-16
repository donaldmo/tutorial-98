import { readSaasPlans, readSaasPlansMap } from '../utils/saasPlansFile.js';

export const getSaasPlans = () => readSaasPlans();
export const getSaasPlansMap = () => readSaasPlansMap();
