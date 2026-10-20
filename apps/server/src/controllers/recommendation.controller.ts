import {
  assessmentQuerySchema,
  recommendationRequestSchema,
  toAssessmentQueryString,
} from '@rel/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import type { MarketAssessmentService } from '../services/marketAssessment.service.js';
import type { MarketDataService } from '../services/marketData.service.js';
import type { CompromiseRecommendationService } from '../services/recommendation/recommendation.service.js';

export class RecommendationController {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly assessments: MarketAssessmentService,
    private readonly recommendations: CompromiseRecommendationService,
  ) {}

  /**
   * POST /compromise-recommendations – personal picks among the compromises. The candidates are
   * recomputed here from the criteria (the client's copy is never trusted); going through the
   * query-string form applies exactly the validation of GET /market-assessments and shares its
   * result cache.
   */
  create: RequestHandler = async (req, res) => {
    if (req.user === undefined) {
      throw AppError.unauthorized();
    }
    const body = recommendationRequestSchema.parse(req.body);
    const query = assessmentQuerySchema.parse(
      Object.fromEntries(new URLSearchParams(toAssessmentQueryString(body.criteria))),
    );
    const outcome = this.assessments.run(await this.marketData.getMarket(), query);
    if (outcome.status === 'not-found') {
      throw AppError.notFound(
        outcome.reason === 'unknown-city' ? 'העיר המבוקשת לא נמצאה' : 'השכונה לא נמצאה בעיר זו',
      );
    }
    const compromises = outcome.status === 'ok' ? outcome.assessment.compromises : [];
    res.json(await this.recommendations.recommend(req.user.id, compromises, body.priorities));
  };
}
