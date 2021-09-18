# Generated by the gRPC Python protocol compiler plugin. DO NOT EDIT!
"""Client and server classes corresponding to protobuf-defined services."""
import grpc

import ordersigner_pb2 as ordersigner__pb2


class OrderSignerStub(object):
    """Missing associated documentation comment in .proto file."""

    def __init__(self, channel):
        """Constructor.

        Args:
            channel: A grpc.Channel.
        """
        self.SignOrder = channel.unary_unary(
                '/ordersigner.OrderSigner/SignOrder',
                request_serializer=ordersigner__pb2.SignOrderRequest.SerializeToString,
                response_deserializer=ordersigner__pb2.SignOrderResponse.FromString,
                )


class OrderSignerServicer(object):
    """Missing associated documentation comment in .proto file."""

    def SignOrder(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('Method not implemented!')
        raise NotImplementedError('Method not implemented!')


def add_OrderSignerServicer_to_server(servicer, server):
    rpc_method_handlers = {
            'SignOrder': grpc.unary_unary_rpc_method_handler(
                    servicer.SignOrder,
                    request_deserializer=ordersigner__pb2.SignOrderRequest.FromString,
                    response_serializer=ordersigner__pb2.SignOrderResponse.SerializeToString,
            ),
    }
    generic_handler = grpc.method_handlers_generic_handler(
            'ordersigner.OrderSigner', rpc_method_handlers)
    server.add_generic_rpc_handlers((generic_handler,))


 # This class is part of an EXPERIMENTAL API.
class OrderSigner(object):
    """Missing associated documentation comment in .proto file."""

    @staticmethod
    def SignOrder(request,
            target,
            options=(),
            channel_credentials=None,
            call_credentials=None,
            insecure=False,
            compression=None,
            wait_for_ready=None,
            timeout=None,
            metadata=None):
        return grpc.experimental.unary_unary(request, target, '/ordersigner.OrderSigner/SignOrder',
            ordersigner__pb2.SignOrderRequest.SerializeToString,
            ordersigner__pb2.SignOrderResponse.FromString,
            options, channel_credentials,
            insecure, call_credentials, compression, wait_for_ready, timeout, metadata)
