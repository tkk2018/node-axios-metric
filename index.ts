import axios_static, { AxiosInstance, AxiosResponse, AxiosStatic, InternalAxiosRequestConfig, RawAxiosRequestHeaders, RawAxiosResponseHeaders } from "axios";
import { EndMetric, HttpMetric, RequestMetric, ResponseMetric } from "http-metric";

export interface Metadata {
  [x: string]: any;
  metric: { request: RequestMetric };
};

declare module "axios" {
  export interface InternalAxiosRequestConfig {
    metadata: Metadata;
  }
};

export class AxiosRequestMetric implements HttpMetric, RequestMetric {
  method?: string;
  url?: string;
  headers: RawAxiosRequestHeaders;
  data?: any;
  start_time: number;

  constructor(config: InternalAxiosRequestConfig<any>, start_time = performance.now()) {
    this.method = config.method;
    this.url = config.url;
    this.headers = config.headers;
    this.data = config.data;
    this.start_time = start_time;
  }
};

export class AxiosResponseMetric implements HttpMetric, ResponseMetric {
  static fromAxiosResponse(response: AxiosResponse<any, any>, end_time = performance.now()): AxiosResponseMetric {
    return new AxiosResponseMetric({
      method: response.config.method,
      url: response.config.url,
      headers: response.headers,
      request: {
        headers: response.config.metadata.metric.request.headers,
        start_time: response.config.metadata.metric.request.start_time,
        data: response.config.metadata.metric.request.data,
      },
      response: {
        status_code: response.status,
        status_message: response.statusText,
        data: response.data,
      },
      end_time: end_time,
      response_time: end_time - response.config.metadata.metric.request.start_time,
    });
  }

  method?: string;
  url?: string;
  request?: RequestMetric;
  headers?: RawAxiosResponseHeaders;
  response: { status_code: number; status_message: string; data?: any; };
  end_time: number;
  response_time: number;

  private constructor(metric: HttpMetric & ResponseMetric) {
    this.method = metric.method;
    this.url = metric.url;
    this.headers = metric.headers;
    this.response = metric.response;
    this.end_time = metric.end_time;
    this.response_time = metric.response_time;
  }
}

export class AxiosErrorMetric implements HttpMetric, EndMetric {
  method?: string;
  url?: string;
  request?: RequestMetric;
  headers?: Record<string, any>;
  end_time: number;
  response_time: number;
  error: unknown;

  constructor (error: unknown, end_time = performance.now()) {
    this.end_time = end_time;
    this.error = error;
    if (axios_static.isAxiosError(error) && error.config) {
      const { config } = error;
      this.method = config.method;
      this.url = config.url;
      this.headers = config.headers; // use request header
      this.request = {
        headers: config.metadata.metric.request.headers,
        start_time: config.metadata.metric.request.start_time,
        data: config.metadata.metric.request.data,
      };
      this.response_time = end_time - config.metadata.metric.request.start_time;
    }
    else {
      this.response_time = -1;
    }
  }
}

export type RequestMetricCallback = (metric: AxiosRequestMetric, config: InternalAxiosRequestConfig<any>) => void;

export type ResponseMetricCallback = (metric: AxiosResponseMetric, response: AxiosResponse<any, any>) => void;

export type ErrorMetricCallback = (metric: AxiosErrorMetric, error: unknown) => void;

export function useRequestMetric(axios: AxiosStatic | AxiosInstance, cb: RequestMetricCallback) {
  axios.interceptors.request.use((config) => {
    const metric = new AxiosRequestMetric(config);
    config.metadata = {
      metric: {
        request: metric,
      },
    };
    cb?.(metric, config);
    return config;
  });
};

export function useResponseMetric(axios: AxiosStatic | AxiosInstance, res: ResponseMetricCallback | undefined | null, err?: ErrorMetricCallback | undefined | null) {
  axios.interceptors.response.use((response) => {
    res?.(AxiosResponseMetric.fromAxiosResponse(response), response);
    return response;
  }, (error) => {
    err?.(new AxiosErrorMetric(error), error);
    return Promise.reject(error);
  });
};

export function use(
  axios: AxiosStatic | AxiosInstance,
  requestMetricCallback: RequestMetricCallback,
  responseMetricCallback: ResponseMetricCallback,
) {
  useRequestMetric(axios, requestMetricCallback);
  useResponseMetric(axios, responseMetricCallback);
};
