/**
 * GraphQL object types for US7 (T101). A coaching insight is advisory only; `suggestedMutation` is a
 * hint that a permitted human applies through a normal validated mutation — the AI never mutates state.
 */
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('CoachingSuggestion')
export class CoachingSuggestionType {
  @Field() title!: string;
  @Field() detail!: string;
  @Field(() => String, { nullable: true }) suggestedMutation?: string | null;
}

@ObjectType('CoachingInsight')
export class CoachingInsightType {
  @Field() summary!: string;
  @Field(() => [CoachingSuggestionType]) suggestions!: CoachingSuggestionType[];
}
