import { assessmentQuerySchema } from '@rel/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import type { MarketAssessmentService } from '../services/marketAssessment.service.js';
import type { MarketDataService } from '../services/marketData.service.js';

export class AssessmentController {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly assessments: MarketAssessmentService,
  ) {}

  /** GET /market-assessments – feasibility, compromises and reference deals for the criteria. */
  get: RequestHandler = async (req, res) => {
    const query = assessmentQuerySchema.parse(req.query);
    const outcome = this.assessments.run(await this.marketData.getMarket(), query);
    if (outcome.status === 'not-found') {
      throw AppError.notFound(
        outcome.reason === 'unknown-city' ? 'העיר המבוקשת לא נמצאה' : 'השכונה לא נמצאה בעיר זו',
      );
    }
    if (outcome.status === 'no-content') {
      res.status(204).end();
      return;
    }
    res.set('Cache-Control', 'private, max-age=60');
    res.json(outcome.assessment);
  };
}
