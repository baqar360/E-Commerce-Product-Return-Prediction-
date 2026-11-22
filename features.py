import numpy as np
import pandas as pd

def clean(df):
    """Remove ID and turn impossible values into NaN (imputed later in the pipeline)."""
    df = df.copy()
    df = df.drop(columns=['order_id'], errors='ignore')
    df.loc[df['product_price'] <= 0, 'product_price'] = np.nan
    df.loc[df['num_product_views'] < 0, 'num_product_views'] = np.nan
    df.loc[df['session_length_minutes'] < 0, 'session_length_minutes'] = np.nan
    df['product_rating'] = df['product_rating'].clip(upper=5)   # rating scale is 0-5
    return df

def add_features(df):
    """Create new features from existing columns."""
    df = df.copy()
    df['is_late_delivery']     = (df['delivery_delay_days'] > 0).astype(int)
    df['price_after_discount'] = df['product_price'] * (1 - df['discount_percent'] / 100)
    df['log_price']            = np.log1p(df['product_price'])
    df['views_per_minute']     = df['num_product_views'] / (df['session_length_minutes'] + 1)
    df['expected_returns']     = df['past_purchase_count'] * df['past_return_rate']
    df['high_return_customer'] = (df['past_return_rate'] > 0.30).astype(int)
    df['age_group'] = pd.cut(df['customer_age'], bins=[0, 25, 40, 60, 120],
                             labels=['<=25', '26-40', '41-60', '60+']).astype(str)
    return df
