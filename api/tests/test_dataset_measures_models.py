"""Tests for dataset measures/dimensions Pydantic models."""
import pytest
from api.models import (
    DatasetMeasureCreate,
    DatasetMeasureUpdate,
    DatasetMeasureResponse,
    DatasetDimensionCreate,
    DatasetDimensionUpdate,
    DatasetDimensionResponse,
)


def test_measure_create_valid():
    m = DatasetMeasureCreate(
        name="revenue", label="Revenue", expression="amount", agg_type="sum"
    )
    assert m.name == "revenue"
    assert m.format == ""
    assert m.filters == []
    assert m.sort_order == 0


def test_measure_create_requires_fields():
    with pytest.raises(Exception):
        DatasetMeasureCreate(name="x")  # missing label, expression, agg_type


def test_measure_update_all_optional():
    m = DatasetMeasureUpdate()
    assert m.name is None
    assert m.label is None


def test_measure_response():
    m = DatasetMeasureResponse(
        id=1, dataset_id=10, name="rev", label="Revenue",
        expression="amount", agg_type="sum",
    )
    assert m.id == 1
    assert m.dataset_id == 10


def test_dimension_create_valid():
    d = DatasetDimensionCreate(
        name="region", label="Region", column_name="region",
    )
    assert d.dimension_type == "categorical"
    assert d.time_grain is None


def test_dimension_create_time():
    d = DatasetDimensionCreate(
        name="order_date", label="Order Date", column_name="order_date",
        dimension_type="time", time_grain="month",
    )
    assert d.dimension_type == "time"
    assert d.time_grain == "month"


def test_dimension_update_all_optional():
    d = DatasetDimensionUpdate()
    assert d.name is None


def test_dimension_response():
    d = DatasetDimensionResponse(
        id=1, dataset_id=10, name="region", label="Region",
        column_name="region", dimension_type="categorical",
    )
    assert d.id == 1
